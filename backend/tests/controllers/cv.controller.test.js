import { describe, test, expect, beforeEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockDatabaseSuccess,
  mockUserData
} from '../__mocks__/supabase.mock.js';

process.env.RATE_LIMIT_ENABLED = 'false';

const serviceMocks = {
  parseMultipartCvFile: jest.fn(),
  extractTextFromPdfFile: jest.fn(),
  parseCvWithOpenAI: jest.fn(),
  normalizeParsedCv: jest.fn(),
  safeRemoveFile: jest.fn()
};

jest.unstable_mockModule('../../services/cvParse.service.js', () => serviceMocks);

const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

const authMiddleware = await import('../../middleware/auth.js');
const { default: app } = await import('../../server.js');

describe('CV Parse Controller', () => {
  const validAuthToken = 'valid-test-token-12345';
  const originalRateLimit = process.env.RATE_LIMIT_ENABLED;

  const mockUser = mockUserData({
    id: 'test-user-id',
    email: 'candidate@example.com'
  });

  beforeEach(() => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    process.env.OPENAI_API_KEY = 'test-openai-key';

    jest.clearAllMocks();

    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
    authMiddleware.__setSupabaseClientForTests(mockSupabaseClient);

    mockSupabaseClient.auth.getUser.mockResolvedValue(
      mockAuthGetUserSuccess(mockUser.id, mockUser.email)
    );

    mockQueryBuilder.single.mockResolvedValue(mockDatabaseSuccess(mockUser));

    serviceMocks.parseMultipartCvFile.mockResolvedValue({ filepath: '/tmp/mock-file.pdf' });
    serviceMocks.extractTextFromPdfFile.mockResolvedValue('mock cv text');
    serviceMocks.parseCvWithOpenAI.mockResolvedValue({
      full_name: 'Jane Doe',
      title: 'Senior Engineer',
      company: 'HRKey',
      location: null,
      skills: ['Leadership'],
      education_summary: null,
      experiences: [
        {
          title: 'Senior Engineer',
          company: 'HRKey',
          start_date: '2024-01',
          end_date: null,
          is_current: true,
          summary: 'Led delivery'
        }
      ],
      education: [
        {
          institution: 'Example University',
          degree: 'MS',
          field_of_study: 'Computer Science',
          start_date: '2020',
          end_date: '2022'
        }
      ]
    });
    serviceMocks.normalizeParsedCv.mockImplementation((payload) => payload);
    serviceMocks.safeRemoveFile.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env.RATE_LIMIT_ENABLED = originalRateLimit;
    authMiddleware.__resetSupabaseClientForTests();
  });

  test('CV-PARSE-1: should parse CV and return normalized payload', async () => {
    const response = await request(app)
      .post('/api/cv/parse')
      .set('Authorization', `Bearer ${validAuthToken}`)
      .attach('cv', Buffer.from('%PDF-1.4 test'), 'resume.pdf')
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      parsed: {
        full_name: 'Jane Doe',
        title: 'Senior Engineer',
        company: 'HRKey',
        location: null,
        skills: ['Leadership'],
        education_summary: null,
        experiences: [
          {
            title: 'Senior Engineer',
            company: 'HRKey',
            start_date: '2024-01',
            end_date: null,
            is_current: true,
            summary: 'Led delivery'
          }
        ],
        education: [
          {
            institution: 'Example University',
            degree: 'MS',
            field_of_study: 'Computer Science',
            start_date: '2020',
            end_date: '2022'
          }
        ]
      }
    });
  });

  test('CV-PARSE-1B: should support partial payload with empty structured arrays', async () => {
    serviceMocks.parseCvWithOpenAI.mockResolvedValueOnce({
      full_name: null,
      title: 'Engineer',
      company: 'Acme',
      location: null,
      skills: [],
      education_summary: null,
      experiences: [],
      education: []
    });

    const response = await request(app)
      .post('/api/cv/parse')
      .set('Authorization', `Bearer ${validAuthToken}`)
      .attach('cv', Buffer.from('%PDF-1.4 test'), 'resume.pdf')
      .expect(200);

    expect(response.body.parsed.experiences).toEqual([]);
    expect(response.body.parsed.education).toEqual([]);
    expect(response.body.parsed.title).toBe('Engineer');
    expect(response.body.parsed.company).toBe('Acme');
  });

  test('CV-PARSE-2: should reject missing file', async () => {
    serviceMocks.parseMultipartCvFile.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'MISSING_FILE' }));

    const response = await request(app)
      .post('/api/cv/parse')
      .set('Authorization', `Bearer ${validAuthToken}`)
      .expect(400);

    expect(response.body.error).toBe('Missing file');
    expect(serviceMocks.safeRemoveFile).toHaveBeenCalledWith(undefined);
  });

  test('CV-PARSE-3: should reject unsupported file type', async () => {
    serviceMocks.parseMultipartCvFile.mockRejectedValueOnce(
      Object.assign(new Error('unsupported'), { code: 'UNSUPPORTED_FILE_TYPE' })
    );

    const response = await request(app)
      .post('/api/cv/parse')
      .set('Authorization', `Bearer ${validAuthToken}`)
      .attach('cv', Buffer.from('plain text'), 'resume.txt')
      .expect(400);

    expect(response.body.error).toBe('Unsupported file type');
  });

  test('CV-PARSE-4: should return OpenAI parse failure gracefully', async () => {
    serviceMocks.parseCvWithOpenAI.mockRejectedValueOnce(
      Object.assign(new Error('down'), { code: 'OPENAI_PARSE_FAILED' })
    );

    const response = await request(app)
      .post('/api/cv/parse')
      .set('Authorization', `Bearer ${validAuthToken}`)
      .attach('cv', Buffer.from('%PDF-1.4 test'), 'resume.pdf')
      .expect(502);

    expect(response.body.error).toBe('OpenAI parsing failure');
    expect(serviceMocks.safeRemoveFile).toHaveBeenCalledWith('/tmp/mock-file.pdf');
  });

  test('CV-PARSE-5: should reject oversized uploads', async () => {
    serviceMocks.parseMultipartCvFile.mockRejectedValueOnce(
      Object.assign(new Error('too large'), { code: 'LIMIT_FILE_SIZE' })
    );

    const response = await request(app)
      .post('/api/cv/parse')
      .set('Authorization', `Bearer ${validAuthToken}`)
      .expect(400);

    expect(response.body.error).toBe('File too large');
  });

  test('CV-PARSE-6: should map extraction failures', async () => {
    serviceMocks.extractTextFromPdfFile.mockRejectedValueOnce(
      Object.assign(new Error('extract fail'), { code: 'PDF_EXTRACTION_FAILED' })
    );

    const response = await request(app)
      .post('/api/cv/parse')
      .set('Authorization', `Bearer ${validAuthToken}`)
      .attach('cv', Buffer.from('%PDF-1.4 test'), 'resume.pdf')
      .expect(422);

    expect(response.body.error).toBe('PDF extraction failed');
    expect(serviceMocks.safeRemoveFile).toHaveBeenCalledWith('/tmp/mock-file.pdf');
  });

  test('CV-PARSE-7: should map invalid model output', async () => {
    serviceMocks.parseCvWithOpenAI.mockRejectedValueOnce(
      Object.assign(new Error('invalid output'), { code: 'OPENAI_INVALID_OUTPUT' })
    );

    const response = await request(app)
      .post('/api/cv/parse')
      .set('Authorization', `Bearer ${validAuthToken}`)
      .attach('cv', Buffer.from('%PDF-1.4 test'), 'resume.pdf')
      .expect(502);

    expect(response.body.error).toBe('Invalid model output');
  });

  test('CV-PARSE-8: should map invalid JSON model output', async () => {
    serviceMocks.parseCvWithOpenAI.mockRejectedValueOnce(
      Object.assign(new Error('invalid json'), { code: 'OPENAI_INVALID_JSON' })
    );

    const response = await request(app)
      .post('/api/cv/parse')
      .set('Authorization', `Bearer ${validAuthToken}`)
      .attach('cv', Buffer.from('%PDF-1.4 test'), 'resume.pdf')
      .expect(502);

    expect(response.body.error).toBe('Invalid model output');
  });

  test('CV-PARSE-9: should map OpenAI configuration failures', async () => {
    serviceMocks.parseCvWithOpenAI.mockRejectedValueOnce(
      Object.assign(new Error('config missing'), { code: 'OPENAI_CONFIG_ERROR' })
    );

    const response = await request(app)
      .post('/api/cv/parse')
      .set('Authorization', `Bearer ${validAuthToken}`)
      .attach('cv', Buffer.from('%PDF-1.4 test'), 'resume.pdf')
      .expect(503);

    expect(response.body.error).toBe('CV parsing unavailable');
  });
});
