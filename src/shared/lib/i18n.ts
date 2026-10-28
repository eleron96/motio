import { i18n } from "@lingui/core";
import { compileMessage } from "@lingui/message-utils/compileMessage";
import { messages as enMessages } from "@/locales/en/messages.mjs";
import { messages as ruMessages } from "@/locales/ru/messages.mjs";
import { messages as deMessages } from "@/locales/de/messages.mjs";

i18n.setMessagesCompiler(compileMessage);

i18n.load({
  en: enMessages,
  ru: ruMessages,
  de: deMessages,
});

export { i18n };
