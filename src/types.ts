interface JobApplicationState {
  emails: string[];
  currentEmail: string | null;
  isJobApplication: boolean | null;
  isRelevantApplication: boolean | null;
  isInternshipApplication: boolean;
  cvData: object | null;
  draftResponse: object | null;
  error: object | null;
}

export { type JobApplicationState };
