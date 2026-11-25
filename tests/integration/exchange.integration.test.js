import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { createEwsClient } from '../../src/ews/connection.js'
import { listFolders } from '../../src/ews/folders.js'
import { searchEmails, readEmail } from '../../src/ews/search.js'
import { saveDraft } from '../../src/ews/draft.js'

function buildNtlmType2Header() {
  // Real Exchange NTLMv2 Type 2 Challenge message (Unicode + NTLM2 + TargetInfo AV_PAIRs).
  const targetName = Buffer.from('CORP', 'utf16le')
  // TargetInfo AV_PAIR: MsvAvNbDomainName (type=2) + MsvAvEOL (type=0)
  const domainVal = Buffer.from('CORP', 'utf16le')
  const targetInfo = Buffer.alloc(4 + domainVal.length + 4)
  targetInfo.writeUInt16LE(2, 0)
  targetInfo.writeUInt16LE(domainVal.length, 2)
  domainVal.copy(targetInfo, 4)
  targetInfo.writeUInt16LE(0, 4 + domainVal.length)
  targetInfo.writeUInt16LE(0, 6 + domainVal.length)

  const headerLen = 56
  const targetNameOffset = headerLen
  const targetInfoOffset = headerLen + targetName.length
  const buf = Buffer.alloc(targetInfoOffset + targetInfo.length)

  buf.write('NTLMSSP\0', 0, 'ascii')
  buf.writeUInt32LE(2, 8) // MessageType = 2 (Challenge)
  buf.writeUInt16LE(targetName.length, 12) // TargetNameLen
  buf.writeUInt16LE(targetName.length, 14) // TargetNameMaxLen
  buf.writeUInt32LE(targetNameOffset, 16) // TargetNameBufferOffset
  // Flags: UNICODE(0x1) | REQUEST_TARGET(0x4) | NTLM(0x200) | ALWAYS_SIGN(0x8000) | TARGET_TYPE_DOMAIN(0x10000) | NTLM2_KEY(0x80000) | TARGET_INFO(0x800000)
  buf.writeUInt32LE(0x00898205, 20)
  Buffer.from([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]).copy(buf, 24) // ServerChallenge
  buf.writeUInt16LE(targetInfo.length, 40) // TargetInfoLen
  buf.writeUInt16LE(targetInfo.length, 42) // TargetInfoMaxLen
  buf.writeUInt32LE(targetInfoOffset, 44) // TargetInfoBufferOffset
  targetName.copy(buf, targetNameOffset)
  targetInfo.copy(buf, targetInfoOffset)
  return `NTLM ${buf.toString('base64')}`
}

function soapEnvelope(bodyXml) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">',
    '<s:Header><h:ServerVersionInfo MajorVersion="15" MinorVersion="2" MajorBuildNumber="2562" MinorBuildNumber="49" Version="V2_4" xmlns:h="http://schemas.microsoft.com/exchange/services/2006/types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/></s:Header>',
    `<s:Body>${bodyXml}</s:Body>`,
    '</s:Envelope>',
  ].join('')
}

function makeSelfSignedCert(dir) {
  const keyPath = join(dir, 'key.pem')
  const certPath = join(dir, 'cert.pem')
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-days', '1', '-subj', '/CN=127.0.0.1',
  ], { stdio: 'ignore' })
  return { keyPath, certPath }
}

test('real ews-javascript-api + @ewsjs/xhr + NTLM + gzip SOAP wire flow works end-to-end', async () => {
  const certDir = await mkdtemp(join(tmpdir(), 'dsh-ex-tls-'))
  let server
  try {
    const { keyPath, certPath } = makeSelfSignedCert(certDir)
    const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)])
    const type2Header = buildNtlmType2Header()
    const observed = { ntlmHandshakes: 0, soapActions: [], sawSend: false }

    server = https.createServer({ key, cert }, async (req, res) => {
      const auth = String(req.headers.authorization || '')
      if (req.method === 'GET' && auth.startsWith('NTLM ')) {
        observed.ntlmHandshakes += 1
        res.writeHead(401, { 'WWW-Authenticate': type2Header, Connection: 'keep-alive' })
        res.end()
        return
      }

      const chunks = []
      for await (const c of req) chunks.push(c)
      const body = Buffer.concat(chunks).toString('utf8')

      if (!auth.startsWith('NTLM ')) {
        res.writeHead(401, { 'WWW-Authenticate': 'NTLM' })
        res.end()
        return
      }

      if (/SendItem|MessageDisposition="Send/i.test(body)) {
        observed.sawSend = true
      }

      let responseXml = ''
      if (body.includes('GetFolder')) {
        observed.soapActions.push('GetFolder')
        responseXml = soapEnvelope(`
          <m:GetFolderResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
            <m:ResponseMessages>
              <m:GetFolderResponseMessage ResponseClass="Success">
                <m:ResponseCode>NoError</m:ResponseCode>
                <m:Folders>
                  <t:Folder>
                    <t:FolderId Id="root-folder-id" ChangeKey="ck0"/>
                    <t:DisplayName>Top of Information Store</t:DisplayName>
                  </t:Folder>
                </m:Folders>
              </m:GetFolderResponseMessage>
            </m:ResponseMessages>
          </m:GetFolderResponse>
        `)
      } else if (body.includes('FindFolder')) {
        observed.soapActions.push('FindFolder')
        responseXml = soapEnvelope(`
          <m:FindFolderResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
            <m:ResponseMessages>
              <m:FindFolderResponseMessage ResponseClass="Success">
                <m:ResponseCode>NoError</m:ResponseCode>
                <m:RootFolder IndexedPagingOffset="3" TotalItemsInView="3" IncludesLastItemInRange="true">
                  <t:Folders>
                    <t:Folder>
                      <t:FolderId Id="f-inbox" ChangeKey="ck1"/>
                      <t:ParentFolderId Id="root-folder-id" ChangeKey="ck0"/>
                      <t:FolderClass>IPF.Note</t:FolderClass>
                      <t:DisplayName>收件箱</t:DisplayName>
                    </t:Folder>
                    <t:Folder>
                      <t:FolderId Id="f-cert" ChangeKey="ck2"/>
                      <t:ParentFolderId Id="root-folder-id" ChangeKey="ck0"/>
                      <t:FolderClass>IPF.Note</t:FolderClass>
                      <t:DisplayName>认证项目</t:DisplayName>
                    </t:Folder>
                    <t:Folder>
                      <t:FolderId Id="f-wv" ChangeKey="ck3"/>
                      <t:ParentFolderId Id="f-cert" ChangeKey="ck2"/>
                      <t:FolderClass>IPF.Note</t:FolderClass>
                      <t:DisplayName>Widevine</t:DisplayName>
                    </t:Folder>
                  </t:Folders>
                </m:RootFolder>
              </m:FindFolderResponseMessage>
            </m:ResponseMessages>
          </m:FindFolderResponse>
        `)
      } else if (body.includes('FindItem')) {
        observed.soapActions.push('FindItem')
        responseXml = soapEnvelope(`
          <m:FindItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
            <m:ResponseMessages>
              <m:FindItemResponseMessage ResponseClass="Success">
                <m:ResponseCode>NoError</m:ResponseCode>
                <m:RootFolder IndexedPagingOffset="1" TotalItemsInView="1" IncludesLastItemInRange="true">
                  <t:Items>
                    <t:Message>
                      <t:ItemId Id="wire-email-1" ChangeKey="ck-m1"/>
                      <t:ParentFolderId Id="f-inbox" ChangeKey="ck1"/>
                      <t:Subject>Widevine Certification Follow-up</t:Subject>
                      <t:DateTimeReceived>2026-11-24T10:30:00Z</t:DateTimeReceived>
                      <t:DateTimeSent>2026-11-24T10:29:00Z</t:DateTimeSent>
                      <t:HasAttachments>false</t:HasAttachments>
                      <t:Importance>High</t:Importance>
                      <t:IsDraft>false</t:IsDraft>
                      <t:ConversationId Id="conv-wire-1"/>
                      <t:From><t:Mailbox><t:EmailAddress>support@widevine.example</t:EmailAddress></t:Mailbox></t:From>
                      <t:IsRead>false</t:IsRead>
                    </t:Message>
                  </t:Items>
                </m:RootFolder>
              </m:FindItemResponseMessage>
            </m:ResponseMessages>
          </m:FindItemResponse>
        `)
      } else if (body.includes('GetItem')) {
        observed.soapActions.push('GetItem')
        responseXml = soapEnvelope(`
          <m:GetItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
            <m:ResponseMessages>
              <m:GetItemResponseMessage ResponseClass="Success">
                <m:ResponseCode>NoError</m:ResponseCode>
                <m:Items>
                  <t:Message>
                    <t:ItemId Id="wire-email-1" ChangeKey="ck-m1"/>
                    <t:ParentFolderId Id="f-inbox" ChangeKey="ck1"/>
                    <t:Subject>Widevine Certification Follow-up</t:Subject>
                    <t:Body BodyType="HTML">&lt;p&gt;Hello from &lt;b&gt;Widevine&lt;/b&gt; support!&lt;/p&gt;</t:Body>
                    <t:DateTimeReceived>2026-11-24T10:30:00Z</t:DateTimeReceived>
                    <t:DateTimeSent>2026-11-24T10:29:00Z</t:DateTimeSent>
                    <t:HasAttachments>false</t:HasAttachments>
                    <t:Importance>High</t:Importance>
                    <t:IsDraft>false</t:IsDraft>
                    <t:ConversationId Id="conv-wire-1"/>
                    <t:InternetMessageId>&lt;wire-1@widevine.example&gt;</t:InternetMessageId>
                    <t:From><t:Mailbox><t:EmailAddress>support@widevine.example</t:EmailAddress></t:Mailbox></t:From>
                    <t:ToRecipients><t:Mailbox><t:EmailAddress>pm@company.com</t:EmailAddress></t:Mailbox></t:ToRecipients>
                    <t:IsRead>false</t:IsRead>
                  </t:Message>
                </m:Items>
              </m:GetItemResponseMessage>
            </m:ResponseMessages>
          </m:GetItemResponse>
        `)
      } else if (body.includes('CreateItem')) {
        observed.soapActions.push('CreateItem')
        responseXml = soapEnvelope(`
          <m:CreateItemResponse xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
            <m:ResponseMessages>
              <m:CreateItemResponseMessage ResponseClass="Success">
                <m:ResponseCode>NoError</m:ResponseCode>
                <m:Items>
                  <t:Message>
                    <t:ItemId Id="wire-draft-99" ChangeKey="ck-d99"/>
                  </t:Message>
                </m:Items>
              </m:CreateItemResponseMessage>
            </m:ResponseMessages>
          </m:CreateItemResponse>
        `)
      } else {
        res.writeHead(400)
        res.end('Unsupported SOAP op')
        return
      }

      // Return gzip-compressed SOAP response to exercise gzip decompression over NTLM.
      const gz = gzipSync(Buffer.from(responseXml, 'utf8'))
      res.writeHead(200, {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Content-Length': gz.byteLength,
      })
      res.end(gz)
    })

    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
    const port = server.address().port
    const serverUrl = `https://127.0.0.1:${port}/EWS/Exchange.asmx`

    const ewsClient = createEwsClient({
      serverUrl,
      email: 'pm@company.com',
      domain: 'CORP',
      username: 'pm',
      password: 'test-ntlm-password',
      timeoutMs: 10000,
      rejectUnauthorized: false, // Self-signed localhost test cert ONLY
    })

    const state = {
      access: { mode: 'whitelist', folders: ['收件箱', '认证项目/Widevine'], emergencyLock: false },
    }

    const listed = await listFolders({ ewsClient, state, readableOnly: false })
    assert.deepEqual(
      listed.folders,
      [
        { path: '收件箱', name: '收件箱', readable: true },
        { path: '认证项目', name: '认证项目', readable: false },
        { path: '认证项目/Widevine', name: 'Widevine', readable: true },
      ],
    )

    const searched = await searchEmails({
      ewsClient,
      state,
      limits: { maxSearchResults: 100, maxBodyChars: 20000 },
      args: { folder: '收件箱', query: 'Widevine' },
    })
    assert.equal(searched.emails.length, 1)
    assert.equal(searched.emails[0].id, 'wire-email-1')
    assert.equal(searched.emails[0].subject, 'Widevine Certification Follow-up')

    const read = await readEmail({
      ewsClient,
      state,
      limits: { maxBodyChars: 20000 },
      args: { email_id: 'wire-email-1' },
    })
    assert.equal(read.id, 'wire-email-1')
    assert.equal(read.message_id, '<wire-1@widevine.example>')
    assert.equal(read.body_text, 'Hello from Widevine support!')
    assert.equal(read.folder, '收件箱')

    const draft = await saveDraft({
      ewsClient,
      state,
      args: {
        to: ['support@widevine.example'],
        subject: 'Re: Widevine Certification Follow-up',
        body_text: 'Gentle follow-up draft',
        in_reply_to: 'wire-email-1',
      },
    })
    assert.equal(draft.draft_id, 'wire-draft-99')
    assert.equal(observed.sawSend, false)
    assert.ok(observed.ntlmHandshakes >= 4)
  } finally {
    if (server) await new Promise((r) => server.close(r))
    await rm(certDir, { recursive: true, force: true })
  }
})

const REAL_URL = process.env.DSH_EXCHANGE_TEST_URL
const REAL_PASS = process.env.DSH_EXCHANGE_PASSWORD

test(
  'live enterprise Exchange EWS integration (opt-in via DSH_EXCHANGE_TEST_URL)',
  { skip: !REAL_URL || !REAL_PASS },
  async () => {
    const ewsClient = createEwsClient({
      serverUrl: REAL_URL,
      email: process.env.DSH_EXCHANGE_TEST_EMAIL || '',
      domain: process.env.DSH_EXCHANGE_TEST_DOMAIN || '',
      username: process.env.DSH_EXCHANGE_TEST_USERNAME || '',
      password: REAL_PASS,
      timeoutMs: 30000,
    })
    const state = { access: { mode: 'blacklist', folders: [], emergencyLock: false } }
    const folders = await listFolders({ ewsClient, state })
    assert.ok(folders.folders.length > 0)
  },
)
