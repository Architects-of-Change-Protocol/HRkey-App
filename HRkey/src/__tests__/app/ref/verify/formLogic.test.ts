import { buildReferencePayload, validateReferencePayload } from "@/app/ref/verify/formLogic"

describe("ref verify form logic", () => {
  const experience = {
    title: "Senior Program Manager",
    company: "Datasys",
    start_date: "2022-01-01",
    end_date: null,
  }

  test("builds contextual payload with competency ratings and structured comments", () => {
    const payload = buildReferencePayload({
      experience,
      overallRating: 5,
      structuredRatings: {
        leadership: 5,
        execution: 4,
        communication: 4,
        ownership: 5,
        collaboration: 4,
      },
      recommendation: "Strong execution in this role.",
      strengths: "Ownership and delivery pace.",
      improvements: "Could delegate more.",
    })

    expect(payload).toEqual({
      ratings: {
        leadership: 5,
        execution: 4,
        communication: 4,
        ownership: 5,
        collaboration: 4,
      },
      comments: {
        recommendation: "Strong execution in this role.",
        strengths: "Ownership and delivery pace.",
        improvements: "Could delegate more.",
      },
    })
  })

  test("builds legacy payload with overall rating and recommendation only", () => {
    const payload = buildReferencePayload({
      experience: null,
      overallRating: 4,
      structuredRatings: {
        leadership: 1,
      },
      recommendation: "Solid recommendation.",
      strengths: "unused",
      improvements: "unused",
    })

    expect(payload).toEqual({
      ratings: { overall: 4 },
      comments: { recommendation: "Solid recommendation." },
    })
  })

  test("validates contextual mode requires at least one competency rating and recommendation text", () => {
    expect(
      validateReferencePayload({
        experience,
        overallRating: 5,
        structuredRatings: {
          leadership: 0,
          execution: 0,
          communication: 0,
          ownership: 0,
          collaboration: 0,
        },
        recommendation: "Great fit",
      })
    ).toBe("Please provide at least one competency rating.")

    expect(
      validateReferencePayload({
        experience,
        overallRating: 5,
        structuredRatings: {
          leadership: 1,
          execution: 0,
          communication: 0,
          ownership: 0,
          collaboration: 0,
        },
        recommendation: "   ",
      })
    ).toBe("Please describe how the candidate performed in this role.")
  })

  test("validates legacy mode requires rating range and recommendation text", () => {
    expect(
      validateReferencePayload({
        experience: null,
        overallRating: 0,
        structuredRatings: {},
        recommendation: "Solid",
      })
    ).toBe("Overall rating must be between 1 and 5.")

    expect(
      validateReferencePayload({
        experience: null,
        overallRating: 4,
        structuredRatings: {},
        recommendation: "   ",
      })
    ).toBe("Please add a recommendation before submitting.")
  })
})
