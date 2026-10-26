import {AnimatedDetails} from './AnimatedDetails.jsx';
import './reviewPresentation.css';

// Supporting context stays available without competing with the decision.
export function ReviewDetails({title='Details',children,className='',...props}) {
  return <AnimatedDetails {...props} className={`review-details ${className}`} keepMounted={false}>
    <summary>{title}</summary>
    <div className="review-details-body">{children}</div>
  </AnimatedDetails>;
}
