import { config } from "@blastctrl/eslint-config/base";

export default [...config, { ignores: ["src/generated/**"] }];
