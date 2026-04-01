import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs/promises';
import zlib from 'zlib';
import { z } from 'zod';

const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024;

const rawParsedCvSchema = z.object({
  full_name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  skills: z.array(z.string()).optional().default([]),
  education_summary: z.string().nullable().optional(),
  experiences: z.array(z.object({
    title: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),
    is_current: z.union([z.boolean(), z.string()]).optional(),
    summary: z.string().nullable().optional()
  })).optional().default([]),
  education: z.array(z.object({
    institution: z.string().nullable().optional(),
    degree: z.string().nullable().optional(),
    field_of_study: z.string().nullable().optional(),
    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional()
  })).optional().default([])
});

const PLACEHOLDER_VALUES = new Set([
  '',
  'n/a',
  'na',
  'none',
  'null',
  'unknown',
  '-',
  '--',
  'not provided',
  'not specified'
]);

function sanitizeMessage(message) {
  if (!message) return 'Internal server error';

  return String(message)
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/OPENAI_API_KEY/gi, '[REDACTED]');
}

export async function parseMultipartCvFile(req) {
  const form = formidable({
    maxFileSize: MAX_CV_SIZE_BYTES,
    multiples: false,
    allowEmptyFiles: false
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, _fields, files) => {
      if (err) {
        if (err?.code === 1009 || err?.httpCode === 413) {
          err.code = 'LIMIT_FILE_SIZE';
        }
        reject(err);
        return;
      }

      const fileCandidate = files.cv;
      const file = Array.isArray(fileCandidate) ? fileCandidate[0] : fileCandidate;

      if (!file) {
        const missing = new Error('Please upload a PDF file in the "cv" field.');
        missing.code = 'MISSING_FILE';
        reject(missing);
        return;
      }

      const extension = file.originalFilename?.toLowerCase().split('.').pop() || '';
      const isPdfMime = file.mimetype === 'application/pdf';
      const isPdfExt = extension === 'pdf';

      if (!isPdfMime && !isPdfExt) {
        const unsupported = new Error('Only PDF files are supported.');
        unsupported.code = 'UNSUPPORTED_FILE_TYPE';
        reject(unsupported);
        return;
      }

      resolve(file);
    });
  });
}

export async function extractTextFromPdfFile(filepath) {
  try {
    const buffer = await fs.readFile(filepath);
    const extracted = extractTextFromPdfBuffer(buffer);

    if (!extracted) {
      const error = new Error('Could not extract readable text from PDF');
      error.code = 'PDF_EXTRACTION_EMPTY';
      throw error;
    }

    return extracted;
  } catch (error) {
    const wrapped = new Error('Failed to extract text from PDF');
    wrapped.code = error?.code || 'PDF_EXTRACTION_FAILED';
    throw wrapped;
  }
}

function decodePdfString(input) {
  return input
    .replace(/\\([nrtbf()\\])/g, (_match, char) => {
      if (char === 'n') return '\n';
      if (char === 'r') return '\r';
      if (char === 't') return '\t';
      if (char === 'b') return '\b';
      if (char === 'f') return '\f';
      return char;
    })
    .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function extractTextFromContentStream(text) {
  const parts = [];
  const tjMatches = text.match(/\((?:\\.|[^\\)])*\)\s*Tj/g) || [];
  for (const match of tjMatches) {
    const stringMatch = match.match(/\((.*)\)\s*Tj/);
    if (stringMatch?.[1]) parts.push(decodePdfString(stringMatch[1]));
  }

  const tjArrayMatches = text.match(/\[(.*?)\]\s*TJ/gs) || [];
  for (const match of tjArrayMatches) {
    const strings = match.match(/\((?:\\.|[^\\)])*\)/g) || [];
    for (const str of strings) {
      parts.push(decodePdfString(str.slice(1, -1)));
    }
  }

  return parts.join(' ');
}

function maybeInflateStream(streamBuffer) {
  try {
    return zlib.inflateSync(streamBuffer).toString('latin1');
  } catch {
    return streamBuffer.toString('latin1');
  }
}

function extractTextFromPdfBuffer(buffer) {
  const binary = buffer.toString('latin1');
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const streamTexts = [];
  let match;

  while ((match = streamRegex.exec(binary)) !== null) {
    const streamText = maybeInflateStream(Buffer.from(match[1], 'latin1'));
    const parsed = extractTextFromContentStream(streamText);
    if (parsed.trim()) {
      streamTexts.push(parsed);
    }
  }

  return streamTexts.join(' ').replace(/\s+/g, ' ').trim();
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey });
  if (client?.chat?.completions?.create) return client;
  if (client?.default?.chat?.completions?.create) return client.default;
  return client;
}

function getCreateCompletionFn(client) {
  if (typeof client?.chat?.completions?.create === 'function') {
    return client.chat.completions.create.bind(client.chat.completions);
  }

  if (typeof client?.default?.chat?.completions?.create === 'function') {
    return client.default.chat.completions.create.bind(client.default.chat.completions);
  }

  return null;
}

function buildPrompt(cvText) {
  return [
    {
      role: 'system',
      content: [
        'You are a CV parser.',
        'Return valid JSON only with exactly these keys: full_name, title, company, location, skills, education_summary, experiences, education.',
        'Do not include markdown, prose, explanations, or extra keys.',
        'Use null for unknown scalar fields.',
        'skills must be an array of concise strings with max 10 items.',
        'experiences must be an array (max 10) of objects with keys: title, company, start_date, end_date, is_current, summary.',
        'education must be an array (max 5) of objects with keys: institution, degree, field_of_study, start_date, end_date.',
        'Use [] when experiences/education are not available.',
        'Extract only information explicitly stated or strongly inferable from the CV.',
        'Order experiences by most recent first.',
        'Prefer the latest/current role for title and latest/current company for company.',
        'Do not invent exact dates; only include date strings if reasonably extractable from the CV text.',
        'Keep experience summaries concise (single short sentence).',
        'Never hallucinate.'
      ].join(' ')
    },
    { role: 'user', content: `CV_TEXT:\n${cvText.slice(0, 20000)}` }
  ];
}

export async function parseCvWithOpenAI(cvText) {
  const client = getOpenAIClient();
  const createCompletion = client ? getCreateCompletionFn(client) : null;

  if (!createCompletion) {
    const error = new Error('CV parsing service is unavailable');
    error.code = 'OPENAI_CONFIG_ERROR';
    throw error;
  }

  try {
    const completion = await createCompletion({
      model: 'gpt-4.1-mini',
      messages: buildPrompt(cvText),
      temperature: 0,
      max_tokens: 600,
      response_format: { type: 'json_object' }
    });

    const content = completion?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      const error = new Error('AI parsing service returned empty response');
      error.code = 'OPENAI_EMPTY_RESPONSE';
      throw error;
    }

    let raw;
    try {
      raw = JSON.parse(content);
    } catch {
      const error = new Error('AI parsing service returned invalid JSON');
      error.code = 'OPENAI_INVALID_JSON';
      throw error;
    }

    return rawParsedCvSchema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const wrapped = new Error('AI parsing service returned invalid output');
      wrapped.code = 'OPENAI_INVALID_OUTPUT';
      throw wrapped;
    }

    if (error?.code) throw error;

    const wrapped = new Error(sanitizeMessage(error?.message));
    wrapped.code = 'OPENAI_PARSE_FAILED';
    throw wrapped;
  }
}

export function normalizeParsedCv(parsedCv) {
  const normalized = rawParsedCvSchema.parse(parsedCv);

  const normalizeNullable = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
    return trimmed;
  };

  const seenSkills = new Set();
  const normalizedSkills = [];
  for (const skill of Array.isArray(normalized.skills) ? normalized.skills : []) {
    const trimmed = typeof skill === 'string' ? skill.trim() : '';
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (PLACEHOLDER_VALUES.has(key) || seenSkills.has(key)) continue;
    seenSkills.add(key);
    normalizedSkills.push(trimmed);
    if (normalizedSkills.length >= 10) break;
  }

  const normalizeBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      if (lower === 'true' || lower === 'yes') return true;
      if (lower === 'false' || lower === 'no') return false;
    }
    return false;
  };

  const normalizeDateString = (value) => {
    const normalizedValue = normalizeNullable(value);
    if (!normalizedValue) return null;
    return normalizedValue.slice(0, 32);
  };

  const normalizeExperience = (experience) => {
    if (!experience || typeof experience !== 'object') return null;

    const normalizedExperience = {
      title: normalizeNullable(experience.title),
      company: normalizeNullable(experience.company),
      start_date: normalizeDateString(experience.start_date),
      end_date: normalizeDateString(experience.end_date),
      is_current: normalizeBoolean(experience.is_current),
      summary: normalizeNullable(experience.summary)
    };

    const hasMeaningfulData =
      normalizedExperience.title ||
      normalizedExperience.company ||
      normalizedExperience.start_date ||
      normalizedExperience.end_date ||
      normalizedExperience.summary;

    if (!hasMeaningfulData) return null;

    if (normalizedExperience.is_current) {
      normalizedExperience.end_date = null;
    }

    return normalizedExperience;
  };

  const normalizeEducation = (entry) => {
    if (!entry || typeof entry !== 'object') return null;

    const normalizedEntry = {
      institution: normalizeNullable(entry.institution),
      degree: normalizeNullable(entry.degree),
      field_of_study: normalizeNullable(entry.field_of_study),
      start_date: normalizeDateString(entry.start_date),
      end_date: normalizeDateString(entry.end_date)
    };

    const hasMeaningfulData =
      normalizedEntry.institution ||
      normalizedEntry.degree ||
      normalizedEntry.field_of_study ||
      normalizedEntry.start_date ||
      normalizedEntry.end_date;

    return hasMeaningfulData ? normalizedEntry : null;
  };

  const normalizedExperiences = (Array.isArray(normalized.experiences) ? normalized.experiences : [])
    .map(normalizeExperience)
    .filter(Boolean)
    .slice(0, 10);

  const normalizedEducation = (Array.isArray(normalized.education) ? normalized.education : [])
    .map(normalizeEducation)
    .filter(Boolean)
    .slice(0, 5);

  return {
    full_name: normalizeNullable(normalized.full_name),
    title: normalizeNullable(normalized.title),
    company: normalizeNullable(normalized.company),
    location: normalizeNullable(normalized.location),
    skills: normalizedSkills,
    education_summary: normalizeNullable(normalized.education_summary),
    experiences: normalizedExperiences,
    education: normalizedEducation
  };
}

export async function safeRemoveFile(filepath) {
  if (!filepath) return;
  try {
    await fs.unlink(filepath);
  } catch (_error) {
    // Best effort cleanup
  }
}
