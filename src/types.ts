interface JobApplicationState {
  emails: string[] | [];
  currentEmail: string | null;
  isJobApplication: boolean | null;
  isRelevantApplication: boolean | null;
  isInternshipApplication: boolean | null;
  cvData: object | null;
  draftResponse: object | null;
  error: object | null;
}

type Config = {};

export { type Config, type JobApplicationState };
