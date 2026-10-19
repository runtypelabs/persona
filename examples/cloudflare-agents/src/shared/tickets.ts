export type Ticket = {
  id: string;
  subject: string;
  customer: string;
  company: string;
  email: string;
  status: "open" | "waiting";
  priority: "high" | "normal";
  category: string;
  updatedAt: string;
  messages: {
    id: string;
    author: string;
    role: "customer" | "support";
    body: string;
    time: string;
  }[];
  tags: string[];
};

/** Fictional sample records shared by the workspace and its read-only tools. */
export const tickets: Ticket[] = [
  {
    id: "ticket-1042",
    subject: "Charged twice after upgrading our plan",
    customer: "Maya Chen",
    company: "Bluebird",
    email: "maya@example.com",
    status: "open",
    priority: "high",
    category: "Billing",
    updatedAt: "12 min ago",
    tags: ["Billing", "Upgrade"],
    messages: [
      {
        id: "1042-1",
        author: "Maya Chen",
        role: "customer",
        time: "10:24 AM",
        body: "Hi team — we upgraded to the Team plan this morning and I can see two $49 charges on our card. Could you help us understand what happened? Our workspace is Bluebird. Thanks!",
      },
      {
        id: "1042-2",
        author: "Jordan Lee",
        role: "support",
        time: "10:31 AM",
        body: "Hi Maya, thanks for flagging this. I’m looking into the upgrade and will check whether the second entry is a pending authorization or a settled charge.",
      },
      {
        id: "1042-3",
        author: "Maya Chen",
        role: "customer",
        time: "10:38 AM",
        body: "Thank you! One says pending and the other says completed in our banking app. We just want to make sure we won’t be billed twice.",
      },
    ],
  },
  {
    id: "ticket-1041",
    subject: "Our teammate’s invitation has expired",
    customer: "Alex Morgan",
    company: "Studio North",
    email: "alex@example.com",
    status: "open",
    priority: "normal",
    category: "Access",
    updatedAt: "28 min ago",
    tags: ["Access", "Invitations"],
    messages: [
      {
        id: "1041-1",
        author: "Alex Morgan",
        role: "customer",
        time: "9:52 AM",
        body: "I sent an invitation to our new designer last week. They tried joining today and see an expired-link message. Do I need to remove them and start again?",
      },
      {
        id: "1041-2",
        author: "Jordan Lee",
        role: "support",
        time: "10:05 AM",
        body: "Thanks Alex. I’ll check the invitation guidance and confirm the simplest way to resend access.",
      },
    ],
  },
  {
    id: "ticket-1038",
    subject: "Webhook deliveries are arriving late",
    customer: "Sam Rivera",
    company: "Papertrail",
    email: "sam@example.com",
    status: "waiting",
    priority: "high",
    category: "Integrations",
    updatedAt: "46 min ago",
    tags: ["Integrations", "Webhooks"],
    messages: [
      {
        id: "1038-1",
        author: "Sam Rivera",
        role: "customer",
        time: "9:14 AM",
        body: "Our order-created webhooks have been arriving about five minutes late since this morning. We’re receiving them, but our workflow is delayed. Is there an incident?",
      },
      {
        id: "1038-2",
        author: "Jordan Lee",
        role: "support",
        time: "9:28 AM",
        body: "I’m checking delivery status and our retry guidance. Please keep your endpoint available while we investigate.",
      },
    ],
  },
];
export function getTicket(id: unknown): Ticket | undefined {
  return tickets.find((ticket) => ticket.id === id);
}
