import type { AgentConfig } from "../index.js";

/**
 * Phone receptionist agent for the Phone Agent demo (apps/web/phone-agent-demo.html).
 * Runs Pipecat's PhoneLLM Mini (`phonellm-mini`), a voice-agent model tuned for
 * low-latency tool calling. Both tools are keyless external GETs so the demo
 * needs no secrets beyond the proxy's Runtype key.
 */
export const PHONE_RECEPTIONIST_AGENT: AgentConfig = {
  name: "Sunrise Travel Receptionist",
  model: "phonellm-mini",
  reasoning: false,
  systemPrompt:
    "You are the phone receptionist for Sunrise Travel, a small travel agency. " +
    "You are speaking out loud on a phone call, so keep every reply to one or two short spoken sentences. " +
    "Never use lists, markdown, headings, or emoji. Say numbers the way a person would say them, " +
    "for example \"seventy two degrees\" rather than \"72°F\". Speak English only. " +
    "When a caller asks about the current weather anywhere, call get_current_weather with that place's " +
    "latitude and longitude, then tell them the temperature in Fahrenheit and the sky conditions. " +
    "Never guess the weather without calling the tool. Translate the WMO weather code into plain words " +
    "(0 clear, 1 to 3 partly cloudy, 45 or 48 fog, 51 to 67 rain or drizzle, 71 to 77 snow, 80 to 82 showers, 95 and up thunderstorms). " +
    "When a caller asks whether the office is open or about opening hours, call check_office_hours. " +
    "The office is open Monday to Friday, nine to six Central time; compare that against the day and time it returns. " +
    "If a caller asks to book a trip, offer to have an agent call them back.",
  tools: {
    maxToolCalls: 3,
    runtimeTools: [
      {
        name: "get_current_weather",
        description:
          "Returns the current temperature (Fahrenheit) and WMO weather code for a latitude/longitude from the Open-Meteo public API.",
        toolType: "external",
        parametersSchema: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              description: "Latitude in decimal degrees, e.g. 30.27 for Austin, Texas",
            },
            longitude: {
              type: "number",
              description: "Longitude in decimal degrees, e.g. -97.74 for Austin, Texas",
            },
          },
          required: ["latitude", "longitude"],
        },
        config: {
          url: "https://api.open-meteo.com/v1/forecast?latitude={{latitude}}&longitude={{longitude}}&current=temperature_2m,weather_code&temperature_unit=fahrenheit",
          method: "GET",
          headers: { accept: "application/json" },
        },
      },
      {
        name: "check_office_hours",
        description:
          "Returns the current day of week and local time at the Sunrise Travel office (America/Chicago). The office is open Monday to Friday, 9 AM to 6 PM.",
        toolType: "external",
        parametersSchema: { type: "object", properties: {} },
        config: {
          url: "https://timeapi.io/api/time/current/zone?timeZone=America/Chicago",
          method: "GET",
          headers: { accept: "application/json" },
        },
      },
    ],
  },
  loopConfig: { maxTurns: 3 },
};
