import { Heading, Text } from "react-email";
import { Layout, Lines, OpenButton, styles } from "./_components/Layout";
import { absoluteUrl, type NotificationEmailProps } from "./types";

/** One notification, sent right away (email delivery "immediate"). Subject = title. */
export default function NotificationEmail({ title, body, url, appUrl }: NotificationEmailProps) {
  const link = absoluteUrl(url, appUrl);
  return (
    <Layout preview={body} appUrl={appUrl}>
      <Heading as="h1" style={styles.h1}>
        {title}
      </Heading>
      <Text style={styles.body}>
        <Lines text={body} />
      </Text>
      {link && <OpenButton href={link} />}
    </Layout>
  );
}

NotificationEmail.PreviewProps = {
  title: "Time to request your reimbursements",
  body: "2 charges are waiting to be reimbursed by Salary:\nSpotify, 4 Oct: €10.99\nNetflix, 28 Sep: €12.99",
  url: "/subscriptions",
  appUrl: "https://subs.example.com",
} satisfies NotificationEmailProps;
