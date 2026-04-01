export type ExperienceContext = {
  title: string | null
  company: string | null
  start_date: string | null
  end_date: string | null
} | null

export type ReferencePayload = {
  ratings: Record<string, number>
  comments: {
    recommendation: string
    strengths?: string
    improvements?: string
  }
}

export function buildReferencePayload(params: {
  experience: ExperienceContext
  overallRating: number
  structuredRatings: Record<string, number>
  recommendation: string
  strengths: string
  improvements: string
}): ReferencePayload {
  const {
    experience,
    overallRating,
    structuredRatings,
    recommendation,
    strengths,
    improvements,
  } = params

  if (experience) {
    return {
      ratings: structuredRatings,
      comments: {
        recommendation,
        strengths,
        improvements,
      },
    }
  }

  return {
    ratings: { overall: overallRating },
    comments: { recommendation },
  }
}

export function validateReferencePayload(params: {
  experience: ExperienceContext
  overallRating: number
  structuredRatings: Record<string, number>
  recommendation: string
}): string | null {
  const { experience, overallRating, structuredRatings, recommendation } = params
  const recommendationText = recommendation.trim()

  if (experience) {
    const hasAnyRating = Object.values(structuredRatings).some((value) => Number(value) > 0)
    if (!hasAnyRating) return "Please provide at least one competency rating."
    if (!recommendationText) return "Please describe how the candidate performed in this role."
    return null
  }

  if (!recommendationText) return "Please add a recommendation before submitting."
  if (!Number.isFinite(overallRating) || overallRating < 1 || overallRating > 5) {
    return "Overall rating must be between 1 and 5."
  }

  return null
}
