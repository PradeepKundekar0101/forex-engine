import winston, { format } from "winston";
import { Logtail } from "@logtail/node";
import { LogtailTransport } from "@logtail/winston";

const logtail = new Logtail(process.env.LOGTAIL_TOKEN || "");

export const logger = winston.createLogger({
  level: "info",
  format: format.combine(
    format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "app.log", level: "info" }),
    // new LogtailTransport(logtail),
  ],
});
