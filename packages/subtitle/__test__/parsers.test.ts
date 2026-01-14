import { describe, it, expect } from 'vitest';
import { parseSubtitle, detectFormat } from '../src/parsers';
import type { AssStyle } from '../src/parsers/ass';
import { parseASS } from '../src/parsers/ass';
import { parseSBV } from '../src/parsers/sbv';
import { parseSRT } from '../src/parsers/srt';
import { parseTimestamp, parseTimelineLine } from '../src/parsers/utils';
import { parseVTT } from '../src/parsers/vtt';

describe('parsers/utils', () => {
  describe('parseTimestamp', () => {
    it('should parse HH:MM:SS.mmm format (VTT)', () => {
      expect(parseTimestamp('00:00:00.000')).toBe(0);
      expect(parseTimestamp('00:00:05.500')).toBe(5.5);
      expect(parseTimestamp('00:01:30.000')).toBe(90);
      expect(parseTimestamp('01:30:45.123')).toBeCloseTo(5445.123, 3);
    });

    it('should parse HH:MM:SS,mmm format (SRT)', () => {
      expect(parseTimestamp('00:00:00,000')).toBe(0);
      expect(parseTimestamp('00:00:05,500')).toBe(5.5);
      expect(parseTimestamp('00:01:30,000')).toBe(90);
    });

    it('should parse MM:SS.mmm format (VTT shorthand)', () => {
      expect(parseTimestamp('00:00.000')).toBe(0);
      expect(parseTimestamp('01:30.500')).toBe(90.5);
      expect(parseTimestamp('59:59.999')).toBeCloseTo(3599.999, 3);
    });

    it('should handle whitespace', () => {
      expect(parseTimestamp('  00:00:05.000  ')).toBe(5);
    });

    it('should return 0 for invalid format', () => {
      expect(parseTimestamp('invalid')).toBe(0);
      expect(parseTimestamp('')).toBe(0);
    });
  });

  describe('parseTimelineLine', () => {
    it('should parse VTT timeline', () => {
      const result = parseTimelineLine('00:00:00.000 --> 00:00:05.000');
      expect(result).toEqual([0, 5]);
    });

    it('should parse SRT timeline', () => {
      const result = parseTimelineLine('00:00:00,000 --> 00:00:05,000');
      expect(result).toEqual([0, 5]);
    });

    it('should handle extra spaces', () => {
      const result = parseTimelineLine('00:00:00.000  -->  00:00:05.000');
      expect(result).toEqual([0, 5]);
    });

    it('should return null for invalid format', () => {
      expect(parseTimelineLine('invalid')).toBeNull();
      expect(parseTimelineLine('')).toBeNull();
      expect(parseTimelineLine('00:00:00.000')).toBeNull();
    });
  });
});

describe('parsers/vtt', () => {
  it('should parse basic VTT content', () => {
    const content = `WEBVTT

00:00:00.000 --> 00:00:05.000
First subtitle

00:00:05.000 --> 00:00:10.000
Second subtitle`;

    const cues = parseVTT(content);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({
      id: undefined,
      startTime: 0,
      endTime: 5,
      text: 'First subtitle',
    });
    expect(cues[1]).toEqual({
      id: undefined,
      startTime: 5,
      endTime: 10,
      text: 'Second subtitle',
    });
  });

  it('should parse VTT with cue IDs', () => {
    const content = `WEBVTT

1
00:00:00.000 --> 00:00:05.000
First subtitle

2
00:00:05.000 --> 00:00:10.000
Second subtitle`;

    const cues = parseVTT(content);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.id).toBe('1');
    expect(cues[1]?.id).toBe('2');
  });

  it('should parse multi-line text', () => {
    const content = `WEBVTT

00:00:00.000 --> 00:00:05.000
Line one
Line two
Line three`;

    const cues = parseVTT(content);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe('Line one\nLine two\nLine three');
  });

  it('should skip NOTE comments', () => {
    const content = `WEBVTT

NOTE This is a comment

00:00:00.000 --> 00:00:05.000
Subtitle text`;

    const cues = parseVTT(content);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe('Subtitle text');
  });

  it('should handle Windows line endings', () => {
    const content =
      'WEBVTT\r\n\r\n00:00:00.000 --> 00:00:05.000\r\nSubtitle text';
    const cues = parseVTT(content);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe('Subtitle text');
  });

  it('should handle empty content', () => {
    expect(parseVTT('')).toEqual([]);
    expect(parseVTT('WEBVTT')).toEqual([]);
    expect(parseVTT('WEBVTT\n\n')).toEqual([]);
  });
});

describe('parsers/srt', () => {
  it('should parse basic SRT content', () => {
    const content = `1
00:00:00,000 --> 00:00:05,000
First subtitle

2
00:00:05,000 --> 00:00:10,000
Second subtitle`;

    const cues = parseSRT(content);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({
      id: '1',
      startTime: 0,
      endTime: 5,
      text: 'First subtitle',
    });
    expect(cues[1]).toEqual({
      id: '2',
      startTime: 5,
      endTime: 10,
      text: 'Second subtitle',
    });
  });

  it('should parse multi-line text', () => {
    const content = `1
00:00:00,000 --> 00:00:05,000
Line one
Line two`;

    const cues = parseSRT(content);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe('Line one\nLine two');
  });

  it('should skip invalid sequence numbers', () => {
    const content = `invalid
00:00:00,000 --> 00:00:05,000
Should be skipped

1
00:00:05,000 --> 00:00:10,000
Valid subtitle`;

    const cues = parseSRT(content);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.id).toBe('1');
  });

  it('should handle empty content', () => {
    expect(parseSRT('')).toEqual([]);
    expect(parseSRT('\n\n\n')).toEqual([]);
  });
});

describe('parsers/sbv', () => {
  it('should parse basic SBV content', () => {
    const content = `0:00:00.000,0:00:05.000
First subtitle

0:00:05.000,0:00:10.000
Second subtitle`;

    const cues = parseSBV(content);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({
      id: '1',
      startTime: 0,
      endTime: 5,
      text: 'First subtitle',
    });
    expect(cues[1]).toEqual({
      id: '2',
      startTime: 5,
      endTime: 10,
      text: 'Second subtitle',
    });
  });

  it('should parse multi-line text', () => {
    const content = `0:00:00.000,0:00:05.000
Line one
Line two`;

    const cues = parseSBV(content);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe('Line one\nLine two');
  });

  it('should handle spaces around comma', () => {
    const content = `0:00:00.000 , 0:00:05.000
Subtitle text`;

    const cues = parseSBV(content);
    expect(cues).toHaveLength(1);
  });

  it('should handle empty content', () => {
    expect(parseSBV('')).toEqual([]);
  });
});

describe('parsers/ass', () => {
  it('should parse basic ASS content', () => {
    const content = `[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,First subtitle
Dialogue: 0,0:00:05.00,0:00:10.00,Default,,0,0,0,,Second subtitle`;

    const cues = parseASS(content);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.startTime).toBe(0);
    expect(cues[0]?.endTime).toBe(5);
    expect(cues[0]?.text).toBe('First subtitle');
    expect(cues[1]?.startTime).toBe(5);
    expect(cues[1]?.endTime).toBe(10);
    expect(cues[1]?.text).toBe('Second subtitle');
  });

  it('should parse ASS timestamps correctly (centiseconds)', () => {
    const content = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,1:30:45.50,1:30:50.75,Default,,0,0,0,,Test`;

    const cues = parseASS(content);
    expect(cues).toHaveLength(1);
    // 1 hour + 30 min + 45.50 sec = 3600 + 1800 + 45.50 = 5445.50
    expect(cues[0]?.startTime).toBeCloseTo(5445.5, 2);
    expect(cues[0]?.endTime).toBeCloseTo(5450.75, 2);
  });

  it('should clean style tags from text', () => {
    const content = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\b1}Bold{\\b0} and {\\i1}italic{\\i0}`;

    const cues = parseASS(content);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe('Bold and italic');
  });

  it('should convert \\N and \\n to newlines', () => {
    const content = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Line one\\NLine two\\nLine three`;

    const cues = parseASS(content);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe('Line one\nLine two\nLine three');
  });

  it('should handle text with commas', () => {
    const content = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Hello, world, how are you?`;

    const cues = parseASS(content);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toBe('Hello, world, how are you?');
  });

  it('should parse styles section', () => {
    const content = `[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, Bold, Italic
Style: Default,Arial,20,&H00FFFFFF,0,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Test`;

    const cues = parseASS(content, true);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.data).toBeDefined();
    expect(cues[0]?.data?.styleName).toBe('Default');
  });

  it('should support both PrimaryColour and PrimaryColor spellings', () => {
    // Test with British spelling (8-digit includes alpha: AABBGGRR)
    const contentBritish = `[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour
Style: Default,Arial,20,&H00FFFFFF

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Test`;

    const cuesBritish = parseASS(contentBritish, true);
    // &H00FFFFFF = alpha 00, blue FF, green FF, red FF -> rgba(255, 255, 255, 1.00)
    const styleBritish = cuesBritish[0]?.data?.style as AssStyle | undefined;
    expect(styleBritish?.primaryColor).toContain('255');

    // Test with American spelling (6-digit: BBGGRR)
    const contentAmerican = `[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColor
Style: Default,Arial,20,&HFF0000

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Test`;

    const cuesAmerican = parseASS(contentAmerican, true);
    // &HFF0000 = blue FF, green 00, red 00 -> #0000FF
    const styleAmerican = cuesAmerican[0]?.data?.style as AssStyle | undefined;
    expect(styleAmerican?.primaryColor).toBe('#0000FF');
  });

  it('should sort cues by start time', () => {
    const content = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:10.00,0:00:15.00,Default,,0,0,0,,Third
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,First
Dialogue: 0,0:00:05.00,0:00:10.00,Default,,0,0,0,,Second`;

    const cues = parseASS(content);
    expect(cues).toHaveLength(3);
    expect(cues[0]?.text).toBe('First');
    expect(cues[1]?.text).toBe('Second');
    expect(cues[2]?.text).toBe('Third');
  });

  it('should handle empty content', () => {
    expect(parseASS('')).toEqual([]);
  });
});

describe('parsers/index', () => {
  describe('detectFormat', () => {
    it('should detect format from filename', () => {
      expect(detectFormat('subtitle.vtt')).toBe('vtt');
      expect(detectFormat('subtitle.srt')).toBe('srt');
      expect(detectFormat('subtitle.json')).toBe('json');
      expect(detectFormat('subtitle.sbv')).toBe('sbv');
      expect(detectFormat('subtitle.ass')).toBe('ass');
      expect(detectFormat('subtitle.ssa')).toBe('ass');
    });

    it('should be case insensitive', () => {
      expect(detectFormat('subtitle.VTT')).toBe('vtt');
      expect(detectFormat('subtitle.SRT')).toBe('srt');
    });

    it('should handle full URLs', () => {
      expect(detectFormat('https://example.com/path/to/subtitle.vtt')).toBe(
        'vtt',
      );
      expect(
        detectFormat('https://example.com/path/to/subtitle.srt?param=1'),
      ).toBe('vtt'); // gets 'srt?param=1', falls back
    });

    it('should default to vtt for unknown extensions', () => {
      expect(detectFormat('subtitle.unknown')).toBe('vtt');
      expect(detectFormat('subtitle')).toBe('vtt');
      expect(detectFormat('')).toBe('vtt');
    });
  });

  describe('parseSubtitle', () => {
    it('should parse VTT format', () => {
      const content = `WEBVTT

00:00:00.000 --> 00:00:05.000
Test`;
      const cues = parseSubtitle(content, 'vtt');
      expect(cues).toHaveLength(1);
    });

    it('should parse SRT format', () => {
      const content = `1
00:00:00,000 --> 00:00:05,000
Test`;
      const cues = parseSubtitle(content, 'srt');
      expect(cues).toHaveLength(1);
    });

    it('should parse JSON format', () => {
      const content = JSON.stringify([
        { startTime: 0, endTime: 5, text: 'Test' },
      ]);
      const cues = parseSubtitle(content, 'json');
      expect(cues).toHaveLength(1);
      expect(cues[0]?.text).toBe('Test');
    });

    it('should parse JSON with cues property', () => {
      const content = JSON.stringify({
        cues: [{ startTime: 0, endTime: 5, text: 'Test' }],
      });
      const cues = parseSubtitle(content, 'json');
      expect(cues).toHaveLength(1);
    });

    it('should validate JSON cue fields', () => {
      const content = JSON.stringify([
        { startTime: 0, endTime: 5, text: 'Valid' },
        { startTime: 'invalid', endTime: 10, text: 'Invalid' },
        { startTime: 10, endTime: 15 }, // missing text
      ]);
      const cues = parseSubtitle(content, 'json');
      expect(cues).toHaveLength(1);
      expect(cues[0]?.text).toBe('Valid');
    });

    it('should handle invalid JSON gracefully', () => {
      const cues = parseSubtitle('not valid json', 'json');
      expect(cues).toEqual([]);
    });
  });
});
