import { createBrowserRouter } from "react-router-dom";
import Landing from "./pages/Landing";
import GameRoom from "./pages/GameRoom";
import App from "./App";

export const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/preview/g/:gameId", element: <GameRoom mode="preview" /> },
  { path: "/real/g/:gameId", element: <GameRoom mode="real" /> },
  { path: "/local", element: <App /> },
]);
