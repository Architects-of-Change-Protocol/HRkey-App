import {
  extractTextFromPdfFile,
  normalizeParsedCv,
  parseCvWithOpenAI,
  parseMultipartCvFile,
  safeRemoveFile
} from '../services/cvParse.service.js';
import logger from '../logger.js';

function mapParseError(error) {
  const code = error?.code || '';

  if (code === 'MISSING_FILE') {
    return { status: 400, body: { error: 'Missing file', message: 'Please upload a PDF file in the "cv" field.' } };
  }

  if (code === 'UNSUPPORTED_FILE_TYPE') {
    return { status: 400, body: { error: 'Unsupported file type', message: 'Only PDF files are supported.' } };
  }

  if (code === 'LIMIT_FILE_SIZE') {
    return { status: 400, body: { error: 'File too large', message: 'File must be 10MB or smaller.' } };
  }

  if (code === 'PDF_EXTRACTION_EMPTY' || code === 'PDF_EXTRACTION_FAILED') {
    return {
      status: 422,
      body: {
        error: 'PDF extraction failed',
        message: 'Unable to extract text from the uploaded PDF.'
      }
    };
  }

  if (code === 'OPENAI_CONFIG_ERROR') {
    return {
      status: 503,
      body: {
        error: 'CV parsing unavailable',
        message: 'CV parsing service is temporarily unavailable.'
      }
    };
  }

  if (code === 'OPENAI_INVALID_OUTPUT') {
    return {
      status: 502,
      body: {
        error: 'Invalid model output',
        message: 'CV parsing returned invalid data.'
      }
    };
  }

  if (code === 'OPENAI_INVALID_JSON') {
    return {
      status: 502,
      body: {
        error: 'Invalid model output',
        message: 'CV parsing returned invalid data.'
      }
    };
  }

  if (code.startsWith('OPENAI_')) {
    return {
      status: 502,
      body: {
        error: 'OpenAI parsing failure',
        message: 'Unable to parse CV content at the moment.'
      }
    };
  }

  return {
    status: 500,
    body: {
      error: 'Internal server error',
      message: 'Failed to parse CV.'
    }
  };
}

export async function parseCv(req, res) {
  let uploadedFile;
  const startedAt = Date.now();
  const reqLogger = logger.withRequest(req);

  try {
    reqLogger.info('CV parse request received', {
      userId: req.user?.id
    });

    uploadedFile = await parseMultipartCvFile(req);
    reqLogger.info('CV upload accepted', {
      userId: req.user?.id,
      fileSize: uploadedFile?.size
    });

    const extractedText = await extractTextFromPdfFile(uploadedFile.filepath);
    reqLogger.info('CV extraction succeeded', {
      userId: req.user?.id,
      extractedChars: extractedText.length
    });

    const parsed = await parseCvWithOpenAI(extractedText);
    const normalized = normalizeParsedCv(parsed);
    const durationMs = Date.now() - startedAt;

    reqLogger.info('CV parsing succeeded', {
      userId: req.user?.id,
      durationMs,
      hasTitle: Boolean(normalized.title),
      hasCompany: Boolean(normalized.company),
      experienceCount: Array.isArray(normalized.experiences) ? normalized.experiences.length : 0,
      educationCount: Array.isArray(normalized.education) ? normalized.education.length : 0
    });

    return res.status(200).json({
      success: true,
      parsed: normalized
    });
  } catch (error) {
    const mapped = mapParseError(error);
    reqLogger.warn('CV parsing failed', {
      userId: req.user?.id,
      code: error?.code || 'UNKNOWN',
      status: mapped.status,
      durationMs: Date.now() - startedAt
    });
    return res.status(mapped.status).json(mapped.body);
  } finally {
    await safeRemoveFile(uploadedFile?.filepath);
  }
}

export default {
  parseCv
};
