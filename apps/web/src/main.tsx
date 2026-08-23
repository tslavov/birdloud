import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { AppLayout } from "./routes/app-layout";
import { CampaignWorkspaceRoute } from "./routes/campaign-workspace";
import { ElectionWorkspaceRoute } from "./routes/election-workspace";
import { HomeRoute } from "./routes/home";
import { NotFoundRoute } from "./routes/not-found";
import { OrganizerRoute } from "./routes/organizer";
import { ReceiptRoute } from "./routes/receipt";
import { VoteRoute } from "./routes/vote";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <HomeRoute />
      },
      {
        path: "organizer",
        element: <OrganizerRoute />
      },
      {
        path: "organizer/elections/:electionId",
        element: <ElectionWorkspaceRoute />
      },
      {
        path: "organizer/campaigns/:campaignId",
        element: <CampaignWorkspaceRoute />
      },
      {
        path: "vote/:campaignId",
        element: <VoteRoute />
      },
      {
        path: "vote/:campaignId/verify-email",
        element: <VoteRoute />
      },
      {
        path: "vote/:campaignId/receipt/:receipt",
        element: <ReceiptRoute />
      },
      {
        path: "*",
        element: <NotFoundRoute />
      }
    ]
  }
]);

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
