import { buildRaw } from '../../src/send/index';

// Decode the base64url Gmail `raw` field back to the RFC 2822 string.
function decodeRaw(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}

describe('buildRaw', () => {
  const opts = { to: 'a@b.com', subject: 'Hi', body: 'Hello world' };

  it('builds a single text/plain part when there are no attachments', () => {
    const msg = decodeRaw(buildRaw('me@x.com', opts, []));
    expect(msg).toContain('To: a@b.com');
    expect(msg).toContain('Subject: Hi');
    expect(msg).toContain('Content-Type: text/plain; charset=utf-8');
    expect(msg).not.toContain('multipart/mixed');
    expect(msg.endsWith('Hello world')).toBe(true);
  });

  it('builds a multipart/mixed envelope carrying each attachment', () => {
    const file = { filename: 'report.pdf', mimeType: 'application/pdf', data: Buffer.from('%PDF-1.4 fake') };
    const raw = buildRaw('me@x.com', opts, [file]);
    const msg = decodeRaw(raw);

    // Envelope is multipart/mixed with a declared boundary.
    const boundaryMatch = /boundary="([^"]+)"/.exec(msg);
    expect(boundaryMatch).not.toBeNull();
    const boundary = boundaryMatch![1];

    // Text body part, base64-encoded.
    expect(msg).toContain('Content-Type: text/plain; charset=utf-8');
    expect(msg).toContain('Content-Transfer-Encoding: base64');
    expect(msg).toContain(Buffer.from('Hello world').toString('base64'));

    // Attachment part: declared type, filename, and the base64 of the bytes.
    expect(msg).toContain('Content-Type: application/pdf; name="report.pdf"');
    expect(msg).toContain('Content-Disposition: attachment; filename="report.pdf"');
    expect(msg).toContain(file.data.toString('base64'));

    // Properly closed multipart envelope.
    expect(msg.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
  });

  it('base64-encodes a UTF-8 body so non-ASCII rides through intact', () => {
    const file = { filename: 'a.bin', mimeType: 'application/octet-stream', data: Buffer.from([1, 2, 3]) };
    const msg = decodeRaw(buildRaw('me@x.com', { to: 'a@b.com', subject: 'S', body: 'héllo — 世界' }, [file]));
    expect(msg).toContain(Buffer.from('héllo — 世界', 'utf8').toString('base64'));
  });
});
