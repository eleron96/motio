import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotFoundPage from "@/app/NotFoundPage";
import { useLocaleStore } from "@/shared/store/localeStore";

describe("NotFoundPage", () => {
  beforeEach(() => {
    useLocaleStore.getState().setLocale("en");
  });

  it("renders english copy and requested path", () => {
    render(
      <MemoryRouter initialEntries={["/lost-route"]}>
        <NotFoundPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Oops, this page took a coffee break.")).toBeInTheDocument();
    expect(screen.getByText("Error 404. We checked everywhere, but nothing is here.")).toBeInTheDocument();
    expect(screen.getByText("Requested path:")).toBeInTheDocument();
    expect(screen.getByText("/lost-route")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Open timeline" })).toHaveAttribute("href", "/app");
  });

  it("renders russian copy when locale is ru", () => {
    useLocaleStore.getState().setLocale("ru");

    render(
      <MemoryRouter initialEntries={["/poteryannaya-stranitsa"]}>
        <NotFoundPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Ой, эта страница ушла за кофе.")).toBeInTheDocument();
    expect(screen.getByText("Ошибка 404. Мы всё проверили, но здесь пусто.")).toBeInTheDocument();
    expect(screen.getByText("Запрошенный путь:")).toBeInTheDocument();
    expect(screen.getByText("/poteryannaya-stranitsa")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "На главную" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Открыть таймлайн" })).toHaveAttribute("href", "/app");
  });
});
