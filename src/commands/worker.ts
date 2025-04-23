import { command, string } from "@drizzle-team/brocli";

const worker = command({
  name: "worker",
  options: {
    "config-file": string()
      .desc("Path to config file")
      .default("./viaduct.yml")
      .required(),
  },
  handler: async (opts) => {},
});

export default worker;
