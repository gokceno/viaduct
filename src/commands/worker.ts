import { command, string } from "@drizzle-team/brocli";
import { StateGraph, type StateGraphArgs } from "@langchain/langgraph";
import { type JobApplicationState } from "../types";
import {
  check,
  analyze,
  evaluate,
  classify,
  draftRejection,
  draftFollowUp,
} from "nodes/email";
import { extract } from "nodes/cv";
import { internship, job } from "nodes/store";
import {
  shouldProcessAsJobApplication,
  checkApplicationRelevance,
  determineApplicationType,
} from "edges";

const worker = command({
  name: "worker",
  options: {
    "config-file": string()
      .desc("Path to config file")
      .default("./viaduct.yml")
      .required(),
  },
  handler: async (opts) => {
    const channels: StateGraphArgs<JobApplicationState>["channels"] = {
      emails: [],
      currentEmail: null,
      isJobApplication: null,
      isRelevantApplication: null,
    };

    const workflow = new StateGraph({ channels });
    workflow
      .addNode("checkGmail", check)
      .addNode("analyzeEmail", analyze)
      .addNode("evaluateRelevance", evaluate)
      .addNode("extractCV", extract)
      .addNode("draftRejectionEmail", draftRejection)
      .addNode("classifyApplicationType", classify)
      .addNode("storeInternshipApplication", internship)
      .addNode("storeJobApplication", job)
      .addNode("draftFollowUpEmail", draftFollowUp)
      .addEdge("__start__", "checkGmail")
      .addEdge("checkGmail", "analyzeEmail")
      .addConditionalEdges("analyzeEmail", shouldProcessAsJobApplication, {
        isJobApplication: "evaluateRelevance",
        notJobApplication: "checkGmail",
      })
      .addConditionalEdges("evaluateRelevance", checkApplicationRelevance, {
        relevantApplication: "extractCV",
        irrelevantApplication: "draftRejectionEmail",
      })
      .addEdge("draftRejectionEmail", "__end__")
      .addEdge("extractCV", "classifyApplicationType")
      .addConditionalEdges(
        "classifyApplicationType",
        determineApplicationType,
        {
          internshipApplication: "storeInternshipApplication",
          jobApplication: "storeJobApplication",
        },
      )
      .addEdge("storeInternshipApplication", "draftFollowUpEmail")
      .addEdge("storeJobApplication", "draftFollowUpEmail")
      .addEdge("draftFollowUpEmail", "__end__");

    const app = workflow.compile();
    try {
      const result = await app.invoke({
        emails: ["foo@bar.com"],
      });
      console.log("Workflow completed with result:", result);
    } catch (error) {
      console.error("Error running agent:", error);
    }
  },
});

export default worker;
