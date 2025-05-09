import { type JobApplicationState } from "../types";

const extract = (state: JobApplicationState) => {
  console.log("Extracting CV data from email");
  return {
    ...state,
    cvData: {
      name: "John Doe",
      email: "john@example.com",
    },
  };
};

export { extract };
