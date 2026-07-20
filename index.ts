import "@logseq/libs";
import { BlockEntity, PageEntity, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";
import ical from "node-ical";
import {
  getDateForPage,
  getDateForPageWithoutBrackets,
} from "logseq-dateutils";
import moment from "moment-timezone";
import { formatParticipants, templateFormatter } from "./parsing";
import { parseEvents, ParsedCalendar } from "./recurrence";

let mainBlockUUID = ""
// const md = require('markdown-it')().use(require('markdown-it-mark'));

const settingsTemplate: SettingSchemaDesc[] = [
  {
    key: "template",
    type: "string",
    default: "{Start} - {End}: {Title}",
    title: "Customizing the Event's Insertion",
    description:
      "The first block that is inserted right under the calendar name for each event. You can use placeholder variables to customize the block. The following variables are available: {Description}, {Date}, {Start}, {End}, {Title}, {Location}, {RawLocation}. Participant variables: {ConfirmedParticipants}, {TentativeParticipants}, {PendingParticipants}, {Participants} (requires a feed that includes attendees — many public/secret iCal URLs omit them).",
  },
  {
    key: "useJSON",
    type: "boolean",
    default: false,
    title: "Use JSON to store calendar data",
    description:
      "If you require more than 5 calendars, select this option so that you can manually define calendars via json",
  },
  {
    key: "IndentCommonBlock",
    type: "boolean",
    default: false,
    title: "Indent all events under the same block",
    description: "If you want to indent all events under the same block, irrespective of the calendar they belong to",
  },
  {
    key: "templateLine2",
    type: "string",
    default: "{Description}",
    title: "Optional: A second block under the event",
    description:
      "Optionally insert a second block indented under the event. Leave blank if you don't want to insert a second blockYou can use placeholder variables to customize the block. The following variables are available: {Description}, {Date}, {Start}, {End}, {Title}, {Location}, {RawLocation}. Participant variables: {ConfirmedParticipants}, {TentativeParticipants}, {PendingParticipants}, {Participants} (requires a feed that includes attendees — many public/secret iCal URLs omit them).",
  },
  {
    key: "timeFormat",
    type: "enum",
    default: ["12 hour time", "24 hour time"],
    title: "Select between 12 and 24 hour time",
    description:
      "Select between 12 and 24 hour time. This option will be followed whenever you call {end} or {start} in the template.",
    enumChoices: ["12 hour time", "24 hour time"],
    enumPicker: "select",
  },
  {
    key: "userEmail",
    type: "string",
    default: "",
    title: "Your Email Address (Optional)",
    description:
      "Enter your email address to filter out events you've declined. Leave blank to show all events. Example: user@example.com",
  },
  {
    key: "hideDeclinedEvents",
    type: "boolean",
    default: true,
    title: "Hide Events You've Declined",
    description:
      "When your email is configured above, automatically hide events where you've declined the invitation.",
  },
  {
    key: "participantEmailFallback",
    type: "boolean",
    default: true,
    title: "Show email when a participant has no name",
    description:
      "For the participant variables ({ConfirmedParticipants}, etc.): when an attendee has no display name, show their email address instead. Disable this to omit nameless attendees entirely. Named participants are always shown as [[links]].",
  },
  {
    key: "calendar1Name",
    type: "string",
    default: "Calendar 1",
    title: "What would you like to name the calendar?",
    description:
      "Choose a name for the calendar. This will be the name of the calendar block that is inserted.",
  },
  {
    key: "calendar1URL",
    type: "string",
    default: "https://calendar.google.com/calendar/ical/...",
    title: "Enter the iCal URL for calendar 1",
    description:
      "Refer to the readme if you're unsure how to get this link for your platform. This is the link to the calendar's ical file. To test if the link is working, open the link in an incognito browser tab and see if it downloads a file with the extension ics",
  },
  {
    key: "calendar2Name",
    type: "string",
    default: "",
    title: "Optional: What would you like to name the calendar?",
    description:
      "Optional: Leave blank if you don't want this calendar to be inserted",
  },
  {
    key: "calendar2URL",
    type: "string",
    default: "",
    title: "Optional: enter the iCAL URL for calendar 2",
    description:
      "Optional: Leave blank if you don't want this calendar to be inserted",
  },
  {
    key: "calendar3Name",
    type: "string",
    default: "",
    title: "Optional: What would you like to name the calendar?",
    description:
      "Optional: Leave blank if you don't want this calendar to be inserted",
  },
  {
    key: "calendar3URL",
    type: "string",
    default: "",
    title: "Optional: enter the iCAL URL for calendar 3",
    description:
      "Optional: Leave blank if you don't want this calendar to be inserted",
  },
  {
    key: "calendar4Name",
    type: "string",
    default: "",
    title: "Optional: What would you like to name the calendar?",
    description:
      "Optional: Leave blank if you don't want this calendar to be inserted",
  },
  {
    key: "calendar4URL",
    type: "string",
    default: "",
    title: "Optional: enter the iCAL URL for calendar 4",
    description:
      "Optional: Leave blank if you don't want this calendar to be inserted",
  },
  {
    key: "calendar5Name",
    type: "string",
    default: "",
    title: "Optional: What would you like to name the calendar?",
    description:
      "Optional: Leave blank if you don't want this calendar to be inserted",
  },
  {
    key: "calendar5URL",
    type: "string",
    default: "",
    title: "Optional: enter the iCAL URL for calendar 5",
    description:
      "Optional: Leave blank if you don't want this calendar to be inserted",
  },
];
logseq.useSettingsSchema(settingsTemplate);

async function findDate(preferredDateFormat: string) {
  if ((await logseq.Editor.getCurrentPage()) != null) {
    //@ts-expect-error
    if ((await logseq.Editor.getCurrentPage())["journal?"] == false) {
      const date = getDateForPageWithoutBrackets(
        new Date(),
        preferredDateFormat
      );
      logseq.App.showMsg("Filtering Calendar Items for " + date);
      // insertJournalBlocks(hello, preferredDateFormat, calendarName, settings, date)
      return date;
    } else {
      //@ts-expect-error
      const date = (await logseq.Editor.getCurrentPage()).name;
      logseq.App.showMsg(`Filtering Calendar Items for ${date}`);
      return date;
    }
  } else {
    return getDateForPageWithoutBrackets(new Date(), preferredDateFormat);
  }
}
function rawParser(rawData: string) {
  logseq.App.showMsg("Parsing Calendar Items");
  const parsed = ical.parseICS(rawData);
  return parseEvents(parsed as unknown as ParsedCalendar, {
    userEmail: logseq.settings?.userEmail,
    hideDeclined: logseq.settings?.hideDeclinedEvents !== false,
  });
}


async function formatTime(rawTimeStamp: Date | string | number, timezone: string | null = null) {
  let formattedTimeStamp;
  let initialHours;
  let minutes;

  // If timezone is provided, use moment-timezone to get the correct time in that timezone
  if (timezone) {
    const momentTime = moment(rawTimeStamp).tz(timezone);
    initialHours = momentTime.hours();
    minutes = momentTime.minutes();
  } else {
    // No timezone provided, use local time (original behavior)
    formattedTimeStamp = new Date(rawTimeStamp);
    initialHours = formattedTimeStamp.getHours();
    minutes = formattedTimeStamp.getMinutes();
  }

  let hours;
  if (initialHours == 0) {
    hours = "00";
  } else {
    hours = initialHours;
    if (initialHours < 10) {
      hours = "0" + initialHours;
    }
  }
  var formattedTime;
  if (minutes < 10) {
    formattedTime = hours + ":" + "0" + minutes;
  } else {
    formattedTime = hours + ":" + minutes;
  }
  if (
    typeof logseq.settings?.timeFormat == "undefined" ||
    logseq.settings?.timeFormat == "12 hour time"
  ) {
    return new Date("1970-01-01T" + formattedTime + "Z").toLocaleTimeString(
      "en-US",
      { timeZone: "UTC", hour12: true, hour: "numeric", minute: "numeric" }
    );
  } else {
    return formattedTime;
  }
}

async function insertJournalBlocks(
  data: Record<string, any>,
  preferredDateFormat: string,
  calendarName: string,
  emptyToday: string,
  useCommonBlock = false
) {
  // let emptyToday = (getDateForPageWithoutBrackets(new Date(), preferredDateFormat))
  console.log(`Current Date: ${emptyToday}`);
  let pageID = await logseq.Editor.createPage(emptyToday, {
    createFirstBlock: true,
  });
  // logseq.App.pushState('page', { name: pageID.name })
  // let pageBlocks = await logseq.Editor.getPageBlocksTree(pageID.name)
  // let footerBlock = pageBlocks[pageBlocks.length -1]
  let startBlock = (await logseq.Editor.insertBlock(pageID!.name, calendarName, {
    sibling: true,
    isPageBlock: true,
  })) as BlockEntity;

  // Collect all events for today first, then insert them in order
  const eventsToInsert = [];
  for (const dataKey in data) {
    try {
      let description = data[dataKey]["description"]; //Parsing result from rawParser into usable data for templateFormatter
      let formattedStart = new Date(data[dataKey]["start"]);
      let startDate = getDateForPageWithoutBrackets(
        formattedStart,
        preferredDateFormat
      );
      let startTime = await formatTime(formattedStart);
      let endTime = await formatTime(data[dataKey]["end"]);
      let location = data[dataKey]["location"];
      let summary;
      summary = data[dataKey]["summary"];
      // }
      // Compute participant lists by RSVP status (declined excluded, self excluded)
      const userEmail = logseq.settings?.userEmail;
      const emailFallback = logseq.settings?.participantEmailFallback !== false;
      let confirmed = formatParticipants(data[dataKey], ["ACCEPTED"], userEmail, emailFallback);
      let tentative = formatParticipants(data[dataKey], ["TENTATIVE"], userEmail, emailFallback);
      let pending = formatParticipants(data[dataKey], ["NEEDS-ACTION"], userEmail, emailFallback);
      let everyone = formatParticipants(data[dataKey], ["ACCEPTED", "TENTATIVE", "NEEDS-ACTION"], userEmail, emailFallback);
      // using user provided template
      let headerString = templateFormatter(
        logseq.settings?.template,
        description,
        startDate,
        startTime,
        endTime,
        summary,
        location,
        confirmed,
        tentative,
        pending,
        everyone
      );
      if (startDate.toLowerCase() == emptyToday.toLowerCase()) {
        eventsToInsert.push({
          summary,
          startTime,
          headerString,
          description,
          startDate,
          endTime,
          location,
          confirmed,
          tentative,
          pending,
          everyone
        });
      }
    } catch (error) {
      console.log(data[dataKey]);
      console.log("error");
      console.log(error);
    }
  }

  // Insert events in forward order (sibling:false appends as last child)
  for (let i = 0; i < eventsToInsert.length; i++) {
    const event = eventsToInsert[i];
    var currentBlock = await logseq.Editor.insertBlock(
      startBlock.uuid,
      `${event.headerString.replaceAll("\\n", "\n")}`,
      { sibling: false }
    );
    if (logseq.settings?.templateLine2 != "") {
      let SecondTemplateLine = templateFormatter(
        logseq.settings?.templateLine2,
        event.description,
        event.startDate,
        event.startTime,
        event.endTime,
        event.summary,
        event.location,
        event.confirmed,
        event.tentative,
        event.pending,
        event.everyone
      );
      await logseq.Editor.insertBlock(
        currentBlock!.uuid,
        `${SecondTemplateLine.replaceAll("\\n", "\n")}`,
        { sibling: false }
      );
    }
  }
  let updatedBlock = await logseq.Editor.getBlock(startBlock.uuid, {
    includeChildren: true,
  })
  if (updatedBlock?.children?.length == 0) {
    logseq.Editor.removeBlock(startBlock.uuid);
    logseq.App.showMsg("No events for the day detected");
  }
}
async function openCalendar2(calendarName: string, url: string) {
  try {
    const userConfigs = await logseq.App.getUserConfigs();
    const preferredDateFormat = userConfigs.preferredDateFormat;
    logseq.App.showMsg("Fetching Calendar Items");

    // Add cache-busting parameter to force fresh calendar data
    const nocache = `nocache=${new Date().getTime()}`;
    const urlWithCacheBuster = url.includes("?") ? `${url}&${nocache}` : `${url}?${nocache}`;

    // fetch (unlike the old axios call) does NOT reject on HTTP error statuses —
    // only on network failure — so check response.ok explicitly.
    const response = await fetch(urlWithCacheBuster);
    if (!response.ok) {
      if (response.status === 404) {
        logseq.App.showMsg("Calendar not found: Check your URL");
      } else {
        logseq.App.showMsg(`Failed to fetch "${calendarName}" (HTTP ${response.status})`);
      }
      console.log(`Calendar fetch failed for ${calendarName}: ${response.status} ${response.statusText}`);
      return;
    }

    const rawData = await response.text();
    const hello = await rawParser(rawData);
    const date = await findDate(preferredDateFormat);
    insertJournalBlocks(hello, preferredDateFormat, calendarName, date);
  } catch (err) {
    logseq.App.showMsg(`Error fetching "${calendarName}". Check the URL and your connection.`);
    console.log(err);
  }
}
async function main() {

  let accounts2: Record<string, string> = {};
  if (logseq.settings?.useJSON) {
    accounts2 = logseq.settings.accountsDetails
  }
  else {
    if (
      logseq.settings?.calendar2Name != "" &&
      logseq.settings?.calendar2URL != ""
    ) {
      accounts2[logseq.settings?.calendar2Name] = logseq.settings?.calendar2URL;
    }
    if (
      logseq.settings?.calendar3Name != "" &&
      logseq.settings?.calendar3URL != ""
    ) {
      accounts2[logseq.settings?.calendar3Name] = logseq.settings?.calendar3URL;
    }
    if (
      logseq.settings?.calendar1Name != "" &&
      logseq.settings?.calendar1URL != ""
    ) {
      accounts2[logseq.settings?.calendar1Name] = logseq.settings?.calendar1URL;
    }
    if (
      logseq.settings?.calendar4Name != "" &&
      logseq.settings?.calendar4URL != ""
    ) {
      accounts2[logseq.settings?.calendar4Name] = logseq.settings?.calendar4URL;
    }
    if (
      logseq.settings?.calendar5Name != "" &&
      logseq.settings?.calendar5URL != ""
    ) {
      accounts2[logseq.settings?.calendar5Name] = logseq.settings?.calendar5URL;
    }
    logseq.updateSettings({ accountsDetails: accounts2 });
  }
  logseq.provideModel({
    async openCalendar2() {
      for (const accountName in accounts2) {
        openCalendar2(accountName, accounts2[accountName]);
      }
    },
  });

  for (const accountName in accounts2) {
   
    let accountSetting = accounts2[accountName];
    logseq.App.registerCommandPalette(
      {
        key: `logseq-${encodeURIComponent(accountName)}-sync`,
        label: `Syncing with ${accountName}`,
      },
      () => {
        openCalendar2(accountName, accountSetting);
      }
    );
  }

  logseq.App.registerUIItem("toolbar", {
    key: "logseq-ical-sync",
    template: `
      <a class="button" data-on-click="openCalendar2">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.5 21h-6.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v5" />
          <path d="M19 16v6" />
          <path d="M22 19l-3 3l-3 -3" />
          <path d="M16 3v4" />
          <path d="M8 3v4" />
          <path d="M4 11h16" />
        </svg>
      </a>
    `,
  });
}
logseq.ready(main).catch(console.error);
