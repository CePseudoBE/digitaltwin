import { test } from '@japa/runner'
import { assertSafeWebhookUrl, isPrivateAddress, WebhookUrlError } from '../src/notifications/webhook_url.js'

test.group('isPrivateAddress', () => {
    test('flags loopback, link-local, RFC1918, CGNAT, multicast and unspecified IPv4', ({ assert }) => {
        for (const ip of ['127.0.0.1', '127.255.255.254', '169.254.169.254', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '224.0.0.1', '0.0.0.0']) {
            assert.isTrue(isPrivateAddress(ip), ip)
        }
    })

    test('accepts public IPv4', ({ assert }) => {
        for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '203.0.113.7']) {
            assert.isFalse(isPrivateAddress(ip), ip)
        }
    })

    test('flags loopback, link-local, unique-local and IPv4-mapped IPv6', ({ assert }) => {
        for (const ip of ['::1', '::', 'fe80::1', 'fd12:3456::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:10.1.2.3', '::ffff:a00:1', '::ffff:7f00:1']) {
            assert.isTrue(isPrivateAddress(ip), ip)
        }
        assert.isFalse(isPrivateAddress('2001:db8::1'))
    })

    test('treats non-IP input as unsafe', ({ assert }) => {
        assert.isTrue(isPrivateAddress('example.com'))
    })
})

test.group('assertSafeWebhookUrl', () => {
    test('rejects malformed URLs and non-http schemes', async ({ assert }) => {
        await assert.rejects(() => assertSafeWebhookUrl('not a url'), WebhookUrlError)
        await assert.rejects(() => assertSafeWebhookUrl('ftp://example.com/x'), /http or https/)
        await assert.rejects(() => assertSafeWebhookUrl('file:///etc/passwd'), WebhookUrlError)
    })

    test('rejects localhost and private IP literals', async ({ assert }) => {
        await assert.rejects(() => assertSafeWebhookUrl('http://localhost:6379/'), /localhost/)
        await assert.rejects(() => assertSafeWebhookUrl('http://api.localhost/'), /localhost/)
        await assert.rejects(() => assertSafeWebhookUrl('http://127.0.0.1:8080/hook'), /private or reserved/)
        await assert.rejects(() => assertSafeWebhookUrl('http://169.254.169.254/latest/meta-data/'), /private or reserved/)
        await assert.rejects(() => assertSafeWebhookUrl('http://[::1]:3000/'), /private or reserved/)
        await assert.rejects(() => assertSafeWebhookUrl('http://[::ffff:10.0.0.1]/'), /private or reserved/)
    })

    test('accepts public IP literals without resolving anything', async ({ assert }) => {
        const url = await assertSafeWebhookUrl('https://203.0.113.7/notify')
        assert.equal(url.hostname, '203.0.113.7')
    })

    test('allowPrivate skips the destination checks but not the scheme check', async ({ assert }) => {
        const url = await assertSafeWebhookUrl('http://127.0.0.1:3000/hook', { allowPrivate: true })
        assert.equal(url.port, '3000')
        await assert.rejects(() => assertSafeWebhookUrl('ftp://127.0.0.1/', { allowPrivate: true }), /http or https/)
    })
})
