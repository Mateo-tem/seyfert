import { Locale, type LocaleString } from 'discord-api-types/v10';
import { basename, dirname } from 'node:path';
import type { Logger } from '../common';
import { BaseHandler } from '../common';
import { Command, SubCommand } from './applications/chat';
import { ContextMenuCommand } from './applications/menu';
import type { UsingClient } from './applications/shared';

export interface CommandHandlerLike {
	values: CommandHandler['values'];
	load: CommandHandler['load'];
	reload: CommandHandler['reload'];
	reloadAll: CommandHandler['reloadAll'];
}

export class CommandHandler extends BaseHandler {
	values: (Command | ContextMenuCommand)[] = [];
	protected filter = (path: string) => path.endsWith('.js') || (!path.endsWith('.d.ts') && path.endsWith('.ts'));

	constructor(
		protected logger: Logger,
		protected client: UsingClient,
	) {
		super(logger);
	}

	async reload(resolve: string | Command) {
		if (typeof resolve === 'string') {
			return this.values.find(x => x.name === resolve)?.reload();
		}
		return resolve.reload();
	}

	async reloadAll(stopIfFail = true) {
		for (const command of this.values) {
			try {
				await this.reload(command.name);
			} catch (e) {
				if (stopIfFail) {
					throw e;
				}
			}
		}
	}

	async load(commandsDir: string, client: UsingClient) {
		const result = (
			await this.loadFilesK<typeof Command | typeof SubCommand | typeof ContextMenuCommand>(
				await this.getFiles(commandsDir),
			)
		).filter(x => x.file);
		this.values = [];

		for (const command of result) {
			let commandInstance;
			try {
				//@ts-expect-error abstract class
				commandInstance = new command.file();
			} catch (e) {
				if (e instanceof Error && e.message === 'command.file is not a constructor') {
					this.logger.warn(
						`${command.path
							.split(process.cwd())
							.slice(1)
							.join(process.cwd())} doesn't export the class by \`export default <Command>\``,
					);
				} else this.logger.warn(e, command);
				continue;
			}
			if (commandInstance instanceof ContextMenuCommand) {
				this.values.push(commandInstance);
				commandInstance.__filePath = command.path;
				await this.__callback?.(commandInstance);
				continue;
			}
			if (!(commandInstance instanceof Command)) {
				continue;
			}
			commandInstance.__filePath = command.path;
			commandInstance.options ??= [] as NonNullable<Command['options']>;
			if (commandInstance.__autoload) {
				//@AutoLoad
				const options = await this.getFiles(dirname(command.path));
				for (const option of options) {
					if (command.name === basename(option)) {
						continue;
					}
					try {
						//@ts-expect-error abstract class
						const subCommand = new (result.find(x => x.path === option)!.file)();
						if (subCommand instanceof SubCommand) {
							subCommand.__filePath = option;
							commandInstance.options.push(subCommand);
						}
					} catch {
						//pass
					}
				}
			}

			for (const option of commandInstance.options ?? []) {
				if (option instanceof SubCommand) {
					option.middlewares = (commandInstance.middlewares ?? []).concat(option.middlewares ?? []);
					option.onMiddlewaresError =
						option.onMiddlewaresError?.bind(option) ?? commandInstance.onMiddlewaresError?.bind(commandInstance);
					option.onRunError = option.onRunError?.bind(option) ?? commandInstance.onRunError?.bind(commandInstance);
					option.onOptionsError =
						option.onOptionsError?.bind(option) ?? commandInstance.onOptionsError?.bind(commandInstance);
					option.onInternalError =
						option.onInternalError?.bind(option) ?? commandInstance.onInternalError?.bind(commandInstance);
					option.onAfterRun = option.onAfterRun?.bind(option) ?? commandInstance.onAfterRun?.bind(commandInstance);
					option.onBotPermissionsFail =
						option.onBotPermissionsFail?.bind(option) ?? commandInstance.onBotPermissionsFail?.bind(commandInstance);
					option.onPermissionsFail =
						option.onPermissionsFail?.bind(option) ?? commandInstance.onPermissionsFail?.bind(commandInstance);
				}
			}

			this.values.push(commandInstance);
			this.__parseCommandLocales(commandInstance, client);

			for (const i of commandInstance.options ?? []) {
				if (i instanceof SubCommand) {
					this.__parseCommandLocales(i, client);
				}
			}

			await this.__callback?.(commandInstance);
		}

		return this.values;
	}

	private __parseCommandLocales(command: Command | SubCommand, client: UsingClient) {
		if (command.__t) {
			command.name_localizations = {};
			command.description_localizations = {};
			for (const locale of Object.keys(client.langs!.values)) {
				const locales = this.client.langs!.aliases.find(x => x[0] === locale)?.[1] ?? [];
				if (Object.values<string>(Locale).includes(locale)) locales.push(locale as LocaleString);

				if (command.__t.name) {
					for (const i of locales) {
						const valueName = client.langs!.getKey(locale, command.__t.name!);
						if (valueName) command.name_localizations[i] = valueName;
					}
				}

				if (command.__t.description) {
					for (const i of locales) {
						const valueKey = client.langs!.getKey(locale, command.__t.description!);
						if (valueKey) command.description_localizations[i] = valueKey;
					}
				}
			}
		}

		for (const options of command.options ?? []) {
			if (options instanceof SubCommand || !options.locales) continue;
			options.name_localizations = {};
			options.description_localizations = {};
			for (const locale of Object.keys(client.langs!.values)) {
				const locales = this.client.langs!.aliases.find(x => x[0] === locale)?.[1] ?? [];
				if (Object.values<string>(Locale).includes(locale)) locales.push(locale as LocaleString);

				if (options.locales.name) {
					for (const i of locales) {
						const valueName = client.langs!.getKey(locale, options.locales.name!);
						if (valueName) options.name_localizations[i] = valueName;
					}
				}

				if (options.locales.description) {
					for (const i of locales) {
						const valueKey = client.langs!.getKey(locale, options.locales.description!);
						if (valueKey) options.description_localizations[i] = valueKey;
					}
				}
			}
		}

		if (command instanceof Command && command.__tGroups) {
			command.groups = {};
			for (const locale of Object.keys(client.langs!.values)) {
				const locales = this.client.langs!.aliases.find(x => x[0] === locale)?.[1] ?? [];
				if (Object.values<string>(Locale).includes(locale)) locales.push(locale as LocaleString);
				for (const group in command.__tGroups) {
					command.groups[group] ??= {
						defaultDescription: command.__tGroups[group].defaultDescription,
						description: [],
						name: [],
					};

					if (command.__tGroups[group].name) {
						for (const i of locales) {
							const valueName = client.langs!.getKey(locale, command.__tGroups[group].name!);
							if (valueName) {
								command.groups[group].name!.push([i, valueName]);
							}
						}
					}

					if (command.__tGroups[group].description) {
						for (const i of locales) {
							const valueKey = client.langs!.getKey(locale, command.__tGroups[group].description!);
							if (valueKey) {
								command.groups[group].description!.push([i, valueKey]);
							}
						}
					}
				}
			}
		}
	}
}
