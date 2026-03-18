import { index, route } from "@react-router/dev/routes";

export default [
  index("./routes/home.tsx"),
  route(":game/:module?/:scope?", "./routes/schemas.tsx"),
];
