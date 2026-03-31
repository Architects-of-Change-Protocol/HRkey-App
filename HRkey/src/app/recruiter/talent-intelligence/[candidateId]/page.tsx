"use client";

import { use } from "react";
import TalentIntelligenceDashboard from "@/components/recruiter-intelligence/TalentIntelligenceDashboard";
import { useTalentIntelligenceDashboard } from "@/lib/recruiter-intelligence/useTalentIntelligenceDashboard";

type PageProps = {
  params: Promise<{
    candidateId: string;
  }>;
};

export default function RecruiterTalentIntelligencePage({ params }: PageProps) {
  const { candidateId } = use(params);

  const dashboard = useTalentIntelligenceDashboard(candidateId);

  return <TalentIntelligenceDashboard data={dashboard} />;
}