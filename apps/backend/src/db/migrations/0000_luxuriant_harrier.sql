CREATE TABLE `chats` (
	`jid` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`added_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_jid` text NOT NULL,
	`sender_jid` text DEFAULT '' NOT NULL,
	`sender_name` text DEFAULT '' NOT NULL,
	`text` text NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`chat_jid`) REFERENCES `chats`(`jid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_messages_chat_jid` ON `messages` (`chat_jid`);--> statement-breakpoint
CREATE INDEX `idx_messages_timestamp` ON `messages` (`chat_jid`,`timestamp`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `summaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_jid` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chat_jid`) REFERENCES `chats`(`jid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_summaries_chat_jid` ON `summaries` (`chat_jid`);--> statement-breakpoint
CREATE TABLE `todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`summary_id` integer NOT NULL,
	`chat_jid` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`summary_id`) REFERENCES `summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_todos_chat_jid` ON `todos` (`chat_jid`);