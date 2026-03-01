import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initGoogleTag, trackGooglePageView } from "@/shared/lib/analytics/googleTag";

export const RouteAnalytics = () => {
  const location = useLocation();

  useEffect(() => {
    initGoogleTag();
  }, []);

  useEffect(() => {
    const pagePath = `${location.pathname}${location.search}${location.hash}`;
    trackGooglePageView(pagePath);
  }, [location.hash, location.pathname, location.search]);

  return null;
};
