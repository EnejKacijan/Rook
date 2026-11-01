import {legalOperator,operatorDetailsReady,legalPublicationApproved} from '../src/legalOperator.js';
import {generateLegalPages} from './generate-legal-pages.mjs';
generateLegalPages({check:true});
const missing=Object.entries(legalOperator).filter(([key,value])=>['name','address','country','contactEmail'].includes(key)&&!value).map(([key])=>key);
const ready=operatorDetailsReady&&legalPublicationApproved;
console.log(JSON.stringify({ready,missingOperatorFields:missing,legalPublicationApproved,manualChecks:'See docs/legal-privacy-audit.md; contact details alone do not satisfy operational requirements.'},null,2));
process.exitCode=ready?0:1;
