// Explicit visual review of all 11 contact sheets against the approved Leg Press.
// Numbers are the stable sorted BEFORE inventory positions, NOT a file heuristic.
export const visuallyKeptPositions=[
  7,12,21,22,25,
  32,36,37,38,39,47,48,49,51,
  61,64,66,68,69,71,78,79,81,88,
  95,97,98,99,100,102,104,106,107,108,111,112,113,119,
  121,127,130,138,141,143,148,
  151,153,161,163,166,168,170,172,174,180,
  184,186,187,191,203,205,
  211,212,213,215,216,217,218,219,220,221,222,224,225,226,227,228,229,230,231,233,234,235,236,237,238,239,240,
  241,242,243,251,253,256,262,264,268,
  272,273,274,275,277,280,281,287,292,294,295,300,
  302,304,307,309,317,318,322,324,
];
// Preserve the good Cable Fly drawing, but split its high-to-low consumer.
export const mappingConcerns={
  'wg-cable-fly':'The new mid-height cable-fly drawing is valid for Cable Fly, not its separately named High-to-Low consumer. A dedicated high-pulley drawing is needed; preserve this approved asset.',
  'wg-preacher-curl':'EZ-bar Preacher Curl and Machine Preacher Curl share a machine-shaped drawing; split the apparatus-specific consumers after approved replacements exist.',
  'wg-split-squat':'The drawing carries dumbbells but also serves Bodyweight Split Squat; provide an unweighted variant without changing exercise identities.',
};
export const contentConcerns={
  'wg-assisted-dip':'Seated/chair apparatus is not an assisted parallel-bar dip machine.',
  'wg-bird-dog':'The drawing shows quadruped kneeling, not the opposed extended arm/leg of bird dog.',
  'wg-hiking':'The current asset shows an elliptical-like machine, not hiking.',
  'wg-lying-hamstring-walkout':'The current asset uses suspended feet/straps instead of heel walkouts on the floor.',
  'wg-seal-jack':'The current asset shows support on parallel bars, not standing seal jacks.',
  'wg-skater-squat':'The current asset is a bilateral squat rather than unilateral skater squat.',
  'wg-stability-ball-hamstring-curl':'The current asset is a prone hands-supported ball knee-tuck, not a supine heel-on-ball hamstring curl.',
  'wg-swimming':'The current asset shows a bench/pulley apparatus, not swimming.',
  'wg-towel-hamstring-curl':'The current asset resembles a supine towel stretch, not a heel-sliding towel curl.',
};
// Added only after returned image AND owner-requested filled-hair review.
export const fullCatalogApproved={
  'step-down':'Controlled unweighted step-down: support foot on step, free heel lowers toward floor. Filled dark-green hair.',
  'hip-adduction-machine':'Seated adduction with resistance pads INSIDE the thighs, connected machine frame. Filled dark-green hair.',
  'rook-high-to-low-cable-fly':'High pulleys with diagonal downward cables, handles finishing low. Distinct from mid-height cable fly.',
  'preacher-curl':'EZ-bar preacher curl, free bar and plates, upper arms supported on sloped pad.',
  'rook-machine-preacher-curl':'Machine preacher curl with connected lever/pivot and weight stack, not a free bar.',
  'rook-bodyweight-split-squat':'Unweighted split squat, both feet on floor, no dumbbells.',
  'assisted-dip':'Assisted parallel-bar dip, knees on counterweight support, feet off floor.',
  'bird-dog':'Quadruped bird dog, opposing arm and leg extended, other palm and knee supporting.',
};
