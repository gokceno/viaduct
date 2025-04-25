import { type JobApplicationState } from "../state";

const internship = (state: JobApplicationState) => {
  console.log("Storing internship application in database");
  return state;
};

const job = (state: JobApplicationState) => {
  console.log("Storing job application in database");
  return state;
};

export { internship, job };
