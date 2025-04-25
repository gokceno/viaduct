import { type JobApplicationState } from "types";

const shouldProcessAsJobApplication = (state: JobApplicationState) => {
  if (state.isJobApplication) {
    return "isJobApplication";
  } else {
    return "notJobApplication";
  }
};

const checkApplicationRelevance = (state: JobApplicationState) => {
  if (state.isRelevantApplication) {
    return "relevantApplication";
  } else {
    return "irrelevantApplication";
  }
};

const determineApplicationType = (state: JobApplicationState) => {
  if (state.isInternshipApplication) {
    return "internshipApplication";
  } else {
    return "jobApplication";
  }
};

export {
  shouldProcessAsJobApplication,
  checkApplicationRelevance,
  determineApplicationType,
};
