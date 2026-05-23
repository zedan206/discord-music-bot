const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, StreamType } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const queues = new Map();

const commands = [
  new SlashCommandBuilder().setName('play').setDescription('شغل أغنية').addStringOption(o => o.setName('اغنية').setDescription('اسم أو رابط').setRequired(true)),
  new SlashCommandBuilder().setName('skip').setDescription('تخطي'),
  new SlashCommandBuilder().setName('stop').setDescription('إيقاف'),
  new SlashCommandBuilder().setName('queue').setDescription('القائمة'),
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`✅ البوت شغّال: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('✅ Slash Commands مسجلة!');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member, channel } = interaction;

  if (commandName === 'play') {
    const query = interaction.options.getString('اغنية');
    const voiceChannel = member?.voice.channel;
    if (!voiceChannel) return interaction.reply({ content: '❌ ادخل روم صوتي أولاً!', ephemeral: true });

    await interaction.deferReply();

    try {
      let url, title;
      if (ytdl.validateURL(query)) {
        url = query;
        const info = await ytdl.getInfo(query);
        title = info.videoDetails.title;
      } else {
        const results = await ytSearch(query);
        if (!results.videos.length) return interaction.editReply('❌ ما لقيت نتائج');
        url = results.videos[0].url;
        title = results.videos[0].title;
      }

      let queue = queues.get(guild.id);

      if (!queue) {
        const player = createAudioPlayer({
          behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
        });

        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: false,
        });

        connection.subscribe(player);

        queue = { textChannel: channel, voiceChannel, connection, player, songs: [] };
        queues.set(guild.id, queue);

        player.on(AudioPlayerStatus.Idle, () => {
          queue.songs.shift();
          if (queue.songs.length > 0) {
            playSong(guild.id);
          } else {
            setTimeout(() => {
              queue.connection?.destroy();
              queues.delete(guild.id);
            }, 30000);
          }
        });

        player.on('error', error => {
          console.error('Player error:', error.message);
          queue.songs.shift();
          if (queue.songs.length > 0) playSong(guild.id);
        });
      }

      queue.songs.push({ title, url });

      if (queue.songs.length === 1) {
        playSong(guild.id);
        interaction.editReply(`▶️ يشغّل: **${title}**`);
      } else {
        interaction.editReply(`✅ أضيفت: **${title}** (#${queue.songs.length})`);
      }

    } catch (err) {
      console.error(err);
      interaction.editReply('❌ صار خطأ، حاول مرة ثانية');
    }
  }

  if (commandName === 'skip') {
    const queue = queues.get(guild.id);
    if (!queue) return interaction.reply({ content: '❌ ما في موسيقى', ephemeral: true });
    queue.player.stop();
    interaction.reply('⏭️ تم التخطي!');
  }

  if (commandName === 'stop') {
    const queue = queues.get(guild.id);
    if (!queue) return interaction.reply({ content: '❌ ما في موسيقى', ephemeral: true });
    queue.songs = [];
    queue.player.stop();
    queue.connection.destroy();
    queues.delete(guild.id);
    interaction.reply('⏹️ تم الإيقاف!');
  }

  if (commandName === 'queue') {
    const queue = queues.get(guild.id);
    if (!queue || !queue.songs.length) return interaction.reply({ content: '📭 القائمة فاضية', ephemeral: true });
    const list = queue.songs.map((s, i) => `${i === 0 ? '▶️' : `${i}.`} ${s.title}`).join('\n');
    const embed = new EmbedBuilder().setTitle('🎵 قائمة الأغاني').setDescription(list).setColor(0x5865F2);
    interaction.reply({ embeds: [embed] });
  }
});

async function playSong(guildId) {
  const queue = queues.get(guildId);
  if (!queue || !queue.songs.length) return;

  const song = queue.songs[0];
  try {
    const stream = ytdl(song.url, {
      filter: 'audioonly',
      quality: 'lowestaudio',
      highWaterMark: 1 << 25,
      dlChunkSize: 0,
    });

    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
    });

    queue.player.play(resource);
    queue.textChannel.send(`▶️ يشغّل: **${song.title}**`);
  } catch (err) {
    console.error('playSong error:', err);
    queue.songs.shift();
    if (queue.songs.length > 0) playSong(guildId);
  }
}

client.login(process.env.TOKEN);
