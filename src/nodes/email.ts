import { type JobApplicationState } from "../types";

const check = async (state: JobApplicationState) => {
  console.log("Checking Gmail for unread messages");
  return {
    ...state,
  };
};

const analyze = async (state: JobApplicationState) => {
  console.log("Analyzing email to determine if it's a job application");
  return {
    ...state,
    currentEmail: state.emails[0],
    isJobApplication: true,
    emails: state.emails.slice(0),
  };
};

const evaluate = async (state: JobApplicationState) => {
  console.log("Evaluating application relevance based on company needs");
  return {
    ...state,
    isRelevantApplication: true,
  };
};

const classify = (state: JobApplicationState) => {
  console.log(
    "Classifying whether application is for internship or full-time position",
  );
  return {
    ...state,
    isInternshipApplication: false,
  };
};

const draftRejection = (state: JobApplicationState) => {
  console.log("Drafting rejection email");
  return {
    ...state,
    draftResponse: {
      to: "applicant@example.com",
      subject: "Application Received",
      body: "Thank you for your interest...",
    },
  };
};

const draftFollowUp = (state: JobApplicationState) => {
  console.log("Drafting follow-up email");
  return {
    ...state,
    draftResponse: {
      to: "applicant@example.com",
      subject: "Your Application: Next Steps",
      body: "Thank you for your interest...",
    },
  };
};

export { check, analyze, evaluate, classify, draftRejection, draftFollowUp };
