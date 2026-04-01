import { describe, test, expect } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { extractTextFromPdfFile, normalizeParsedCv } from '../../services/cvParse.service.js';

describe('cvParse.service', () => {
  test('should normalize empty/placeholder values and dedupe skills', () => {
    const normalized = normalizeParsedCv({
      full_name: '  Jane Doe  ',
      title: 'N/A',
      company: '  HRKey ',
      location: '',
      skills: ['Leadership', ' leadership ', ' ', 'N/A', 'Web3'],
      education_summary: 'none',
      experiences: [],
      education: []
    });

    expect(normalized).toEqual({
      full_name: 'Jane Doe',
      title: null,
      company: 'HRKey',
      location: null,
      skills: ['Leadership', 'Web3'],
      education_summary: null,
      experiences: [],
      education: []
    });
  });

  test('should normalize nested experiences and education and cap array sizes', () => {
    const normalized = normalizeParsedCv({
      full_name: 'Jane',
      title: 'Lead',
      company: 'Acme',
      location: null,
      skills: ['Leadership'],
      education_summary: null,
      experiences: [
        {
          title: '  Lead Engineer ',
          company: ' Acme ',
          start_date: ' 2024-01 ',
          end_date: 'present',
          is_current: 'true',
          summary: '  Led platform initiatives. '
        },
        {
          title: 'n/a',
          company: '',
          start_date: null,
          end_date: null,
          is_current: false,
          summary: null
        },
        ...Array.from({ length: 12 }).map((_, idx) => ({
          title: `Role ${idx}`,
          company: `Company ${idx}`,
          start_date: null,
          end_date: null,
          is_current: false,
          summary: null
        }))
      ],
      education: [
        {
          institution: ' Example University ',
          degree: 'none',
          field_of_study: ' Computer Science ',
          start_date: '2018',
          end_date: '2020'
        },
        ...Array.from({ length: 7 }).map((_, idx) => ({
          institution: `School ${idx}`,
          degree: null,
          field_of_study: null,
          start_date: null,
          end_date: null
        }))
      ]
    });

    expect(normalized.experiences.length).toBe(10);
    expect(normalized.experiences[0]).toEqual({
      title: 'Lead Engineer',
      company: 'Acme',
      start_date: '2024-01',
      end_date: null,
      is_current: true,
      summary: 'Led platform initiatives.'
    });

    expect(normalized.education.length).toBe(5);
    expect(normalized.education[0]).toEqual({
      institution: 'Example University',
      degree: null,
      field_of_study: 'Computer Science',
      start_date: '2018',
      end_date: '2020'
    });
  });

  test('should extract text from simple PDF-like stream content', async () => {
    const fakePdf = Buffer.from('%PDF-1.4\nstream\nBT\n(Senior Engineer) Tj\n(HRKey) Tj\nET\nendstream\n%%EOF', 'latin1');
    const filePath = path.join(os.tmpdir(), `cv-test-${Date.now()}.pdf`);
    await fs.writeFile(filePath, fakePdf);

    const extracted = await extractTextFromPdfFile(filePath);

    expect(extracted).toContain('Senior Engineer');
    expect(extracted).toContain('HRKey');

    await fs.unlink(filePath);
  });
});
