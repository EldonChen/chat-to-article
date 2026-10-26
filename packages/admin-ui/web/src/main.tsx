import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "./components/Layout.tsx";
import "./index.css";
import { ArticleDetailPage } from "./pages/ArticleDetail.tsx";
import { ArticlesPage } from "./pages/Articles.tsx";
import { ExportPage } from "./pages/Export.tsx";
import { LexiconPage } from "./pages/Lexicon.tsx";
import { NotFound } from "./pages/NotFound.tsx";
import { OverviewPage } from "./pages/Overview.tsx";
import { VoicePage } from "./pages/Voice.tsx";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 2000, retry: 1, refetchOnWindowFocus: true } },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <OverviewPage /> },
      { path: "/articles", element: <ArticlesPage /> },
      { path: "/articles/:id", element: <ArticleDetailPage /> },
      { path: "/articles/:id/:tab", element: <ArticleDetailPage /> },
      { path: "/voice", element: <VoicePage /> },
      { path: "/voice/:tab", element: <VoicePage /> },
      { path: "/lexicon", element: <LexiconPage /> },
      { path: "/export", element: <ExportPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
