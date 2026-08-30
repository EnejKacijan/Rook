const validationIssues = validation => (validation?.issues || []).map(issue => ({ code: issue.code, severity: 'hard', workoutDay: issue.day || null, exerciseId: issue.exerciseId || null, explanation: issue.message, repairInstruction: `Resolve deterministic defect: ${issue.message}` }));
const reviewNeedsRepair = review => review?.verdict === 'repair' || (review?.issues || []).some(issue => ['hard', 'major'].includes(issue.severity));

export async function runPlanQualityPipeline({ payload, generateCandidate, reviewCandidate, repairCandidate, validateCandidate, applyPolicy = value => value, maxRepairAttempts = 2, onStage = () => {} }) {
  onStage('candidate'); let candidate = applyPolicy(await generateCandidate(payload));
  let validation = validateCandidate(candidate); onStage('validation', validation);
  let review = validation.valid ? await reviewCandidate({ ...payload, candidatePlan: candidate, deterministicValidation: validation }) : { verdict: 'repair', overallScore: 0, issues: [] };
  if (validation.valid) onStage('review', review);
  for (let attempt = 0; attempt < maxRepairAttempts && (!validation.valid || reviewNeedsRepair(review)); attempt++) {
    const issues = [...validationIssues(validation), ...(review.issues || [])];
    onStage('repair', { attempt: attempt + 1, issueCount: issues.length });
    candidate = applyPolicy(await repairCandidate({ ...payload, candidatePlan: candidate, issues, previousReview: review }));
    validation = validateCandidate(candidate); onStage('validation', validation);
    review = validation.valid ? await reviewCandidate({ ...payload, candidatePlan: candidate, deterministicValidation: validation, priorIssues: issues }) : { verdict: 'repair', overallScore: 0, issues: [] };
    if (validation.valid) onStage('review', review);
  }
  if (!validation.valid || reviewNeedsRepair(review) || review.verdict !== 'pass') {
    const messages = [...validationIssues(validation), ...(review.issues || [])].map(issue => issue.explanation).filter(Boolean).slice(0, 6);
    throw new Error(`AI could not produce a valid coherent plan${messages.length ? `: ${messages.join(' ')}` : '.'}`);
  }
  onStage('final', validation); return { plan: candidate, review, validation };
}
