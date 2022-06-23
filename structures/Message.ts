import type { Model } from "./Base.ts";
import type { Snowflake } from "../util/Snowflake.ts";
import type { Session } from "../session/mod.ts";
import type { AllowedMentionsTypes, DiscordMessage } from "../vendor/external.ts";
import { User } from "./User.ts";
import { MessageFlags, Routes } from "../util/mod.ts";

/**
 * @link https://discord.com/developers/docs/resources/channel#allowed-mentions-object
 */
export interface AllowedMentions {
    parse?: AllowedMentionsTypes[];
    repliedUser?: boolean;
    roles?: Snowflake[];
    users?: Snowflake[];
}

/**
 * @link https://discord.com/developers/docs/resources/channel#edit-message-json-params
 */
export interface EditMessage {
    content?: string;
    allowedMentions?: AllowedMentions;
    flags?: MessageFlags;
}

/**
 * @link https://discord.com/developers/docs/resources/channel#create-message-json-params
 */
export interface CreateMessage {
    content?: string;
    allowedMentions?: AllowedMentions;
}

/**
 * Represents a message
 * @link https://discord.com/developers/docs/resources/channel#message-object
 */
export class Message implements Model {
    constructor(session: Session, data: DiscordMessage) {
        this.session = session;
        this.id = data.id;

        this.channelId = data.channel_id;
        this.guildId = data.guild_id;

        this.author = new User(session, data.author);
        this.flags = data.flags;
        this.pinned = !!data.pinned;
        this.tts = !!data.tts;
        this.content = data.content!;
    }

    readonly session: Session;
    readonly id: Snowflake;

    channelId: Snowflake;
    guildId?: Snowflake;
    author: User;
    flags?: MessageFlags;
    pinned: boolean;
    tts: boolean;
    content: string;

    get url() {
        return `https://discord.com/channels/${this.guildId ?? "@me"}/${this.channelId}/${this.id}`;
    }

    /** Edits the current message */
    async edit({ content, allowedMentions, flags }: EditMessage): Promise<Message> {
        const message = await this.session.rest.runMethod(
            this.session.rest,
            "POST",
            Routes.CHANNEL_MESSAGE(this.id, this.channelId),
            {
                content,
                allowed_mentions: {
                    parse: allowedMentions?.parse,
                    roles: allowedMentions?.roles,
                    users: allowedMentions?.users,
                    replied_user: allowedMentions?.repliedUser,
                },
                flags,
            },
        );

        return message;
    }

    async suppressEmbeds(suppress: true): Promise<Message>;
    async suppressEmbeds(suppress: false): Promise<Message | undefined>;
    async suppressEmbeds(suppress = true) {
        if (this.flags === MessageFlags.SUPPRESS_EMBEDS && suppress === false) {
            return;
        }

        const message = await this.edit({ flags: MessageFlags.SUPPRESS_EMBEDS });

        return message;
    }

    async delete({ reason }: { reason: string }): Promise<Message> {
        await this.session.rest.runMethod<undefined>(
            this.session.rest,
            "DELETE",
            Routes.CHANNEL_MESSAGE(this.channelId, this.id),
            { reason },
        );

        return this;
    }

    /** Responds directly in the channel the message was sent */
    async respond({ content, allowedMentions }: CreateMessage): Promise<Message> {
        const message = await this.session.rest.runMethod(
            this.session.rest,
            "POST",
            Routes.CHANNEL_MESSAGES(this.channelId),
            {
                content,
                allowed_mentions: {
                    parse: allowedMentions?.parse,
                    roles: allowedMentions?.roles,
                    users: allowedMentions?.users,
                    replied_user: allowedMentions?.repliedUser,
                },
            },
        );

        return message;
    }

    inGuild(): this is { guildId: string } & Message {
        return Boolean(this.guildId);
    }
}