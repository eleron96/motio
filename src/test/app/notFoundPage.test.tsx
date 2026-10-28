import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotFoundPage from "@/app/NotFoundPage";
import { useLocaleStore } from "@/shared/store/localeStore";

// Translations are covered by src/test/smoke/localeCatalogs.test.ts.
vi.mock("@lingui/macro", () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, idx) => acc + str + (values[idx] ?? ""), ""),
}));

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
});
