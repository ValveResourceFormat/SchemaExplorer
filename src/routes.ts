import { route } from "@react-router/dev/routes";

export default [
  route(":game/convars", "./routes/convars.tsx"),
  route(":game?/:module?/:scope?", "./routes/schemas.tsx"),
];
