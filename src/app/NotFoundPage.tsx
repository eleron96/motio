import { Link, useLocation } from "react-router-dom";
import { Button } from "@/shared/ui/button";
import { useLocaleStore } from "@/shared/store/localeStore";
import { usePageSeo } from "@/shared/lib/seo/usePageSeo";

const NotFoundPage = () => {
  const location = useLocation();
  const locale = useLocaleStore((state) => state.locale);
  const isRu = locale === "ru";

  usePageSeo({
    title: isRu ? "404 — Страница не найдена | Motio" : "404 - Page not found | Motio",
    description: isRu
      ? "Такой страницы не существует. Вернитесь на главную или в таймлайн."
      : "This page does not exist. Return home or jump back to the timeline.",
    robots: "noindex, nofollow",
  });

  const title = isRu
    ? "Ой, эта страница ушла за кофе."
    : "Oops, this page took a coffee break.";
  const subtitle = isRu
    ? "Ошибка 404. Мы всё проверили, но здесь пусто."
    : "Error 404. We checked everywhere, but nothing is here.";
  const hint = isRu
    ? "Вернитесь на главную или сразу откройте таймлайн."
    : "Try returning home or jump back into the timeline.";
  const missingPathLabel = isRu ? "Запрошенный путь" : "Requested path";
  const homeLabel = isRu ? "На главную" : "Back to home";
  const timelineLabel = isRu ? "Открыть таймлайн" : "Open timeline";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_44%),linear-gradient(to_bottom,_#f8fafc,_#eef6fb)]" />

      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-slate-200/85 bg-white/95 p-8 text-center shadow-[0_28px_70px_-34px_rgba(15,23,42,0.35)]">
        <div className="text-5xl font-semibold tracking-tight text-slate-900">404</div>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-3 text-sm text-slate-600">{subtitle}</p>
        <p className="mt-1 text-sm text-slate-600">{hint}</p>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-medium text-slate-700">{missingPathLabel}:</span>{" "}
          <code>{location.pathname}</code>
        </div>

        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild className="sm:min-w-40">
            <Link to="/">{homeLabel}</Link>
          </Button>
          <Button asChild variant="outline" className="sm:min-w-40">
            <Link to="/app">{timelineLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
