import type { MetaFunction } from "react-router";
import { Navigate } from "react-router";

export const meta: MetaFunction = () => [{ title: "Source 2 Schema Explorer" }];

export default function Home() {
  return <Navigate to="/cs2" replace />;
}
