/**
 * Unit tests for src/reason/gemini.ts quota handling.
 *
 * @google/genai is mocked — this covers 429 backoff and the unavailable
 * result without burning live quota (same idea as ingest tests mocking embed).
 */

jest.mock('@google/genai', () => {
  const generateContent = jest.fn();
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: { generateContent },
    })),
    __generateContent: generateContent,
  };
});

import { reason } from '../../src/reason/gemini';

function generateContentMock(): jest.Mock {
  return (jest.requireMock('@google/genai') as { __generateContent: jest.Mock }).__generateContent;
}

const args = {
  systemInstruction: 'Summarize only from context.',
  prompt: 'What did Alice say?',
  context: [
    {
      id: 'msg-1',
      from: 'Alice <alice@example.com>',
      subject: 'Hello',
      date: 'Wed, 09 Sep 2026 12:00:00 -0400',
      snippet: 'Hi there',
      bodyPlain: 'Hi there',
    },
  ],
};

describe('reason — quota handling', () => {
  const generateContent = generateContentMock();
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;

  beforeEach(() => {
    generateContent.mockReset();
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-test';
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  });

  it('returns text when Gemini succeeds', async () => {
    generateContent.mockResolvedValue({ text: 'Alice said hello.' });

    await expect(reason(args)).resolves.toEqual({
      text: 'Alice said hello.',
      available: true,
    });

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(jest.mocked(console.warn)).not.toHaveBeenCalled();
    expect(jest.mocked(console.error)).not.toHaveBeenCalled();
  });

  it('retries 429s with exponential backoff, then returns unavailable without throwing', async () => {
    jest.useFakeTimers();
    generateContent.mockRejectedValue({ status: 429, message: 'RESOURCE_EXHAUSTED' });

    const pending = reason(args);
    await jest.runAllTimersAsync();
    const result = await pending;

    expect(result).toEqual({ text: null, available: false });
    expect(generateContent).toHaveBeenCalledTimes(3);

    const warnings = jest.mocked(console.warn).mock.calls.map((c) => String(c[0]));
    expect(warnings.some((m) => m.includes('QUOTA 429'))).toBe(true);
    expect(warnings.some((m) => m.includes('QUOTA exhausted after retries'))).toBe(true);
    expect(jest.mocked(console.error)).not.toHaveBeenCalled();
  });

  it('returns the summary if a later retry after 429 succeeds', async () => {
    jest.useFakeTimers();
    generateContent
      .mockRejectedValueOnce({ status: 429, message: 'RESOURCE_EXHAUSTED' })
      .mockResolvedValueOnce({ text: 'Alice said hello.' });

    const pending = reason(args);
    await jest.runAllTimersAsync();

    await expect(pending).resolves.toEqual({
      text: 'Alice said hello.',
      available: true,
    });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(jest.mocked(console.error)).not.toHaveBeenCalled();
  });

  it('throws on non-quota failures without retrying', async () => {
    generateContent.mockRejectedValue(new Error('model overloaded'));

    await expect(reason(args)).rejects.toMatchObject({
      code: 'REASON_FAILED',
      message: 'model overloaded',
    });

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(jest.mocked(console.error)).toHaveBeenCalledWith(
      '[reason:gemini] model overloaded',
    );
    expect(jest.mocked(console.warn)).not.toHaveBeenCalled();
  });
});
