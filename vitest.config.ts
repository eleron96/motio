import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Форки платят за каждый модуль пересылкой через IPC, и на полном наборе
    // (197 файлов) это вырождается: collect стоил 22 с на файл против 0.28 с
    // на спокойном прогоне того же кода. Потоки делят память с главным
    // процессом — замер на 30 файлах: 6.30 с → 4.72 с. Изоляцию НЕ снимаем:
    // без неё состояние течёт между файлами и 29 тестов падают.
    pool: "threads",
    // Тесты на userEvent ждут интерфейс в реальном времени. Под нагрузкой
    // дефолтные 5 с — это ложные падения (в CI те же тесты зелёные), а не
    // сломанный код. Пятнадцати хватает с запасом, и по-настоящему зависший
    // тест по-прежнему падает, а не висит вечно.
    testTimeout: 15_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
