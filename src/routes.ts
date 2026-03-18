import { route } from "@react-router/dev/routes";

export default [route(":game?/:module?/:scope?", "./routes/schemas.tsx")];
