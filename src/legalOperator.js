// Supply verified PUBLIC details before publishing the legal notices.
// Do not substitute a repository owner, inferred address or invented mailbox.
export const legalOperator = Object.freeze({
  name: '',
  address: '',
  country: '',
  contactEmail: '',
  registrationNumber: '',
  vatNumber: '',
});
export const operatorDetailsReady = Boolean(legalOperator.name && legalOperator.address && legalOperator.country && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legalOperator.contactEmail));
// A filled contact field is not proof of completed operational/legal review.
export const legalPublicationApproved = false;
export const LEGAL_VERSION = 'draft-2026-11-01';
