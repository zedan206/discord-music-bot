const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
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
  new SlashCommandBuilder().setName('play').setDescription('شغل أغنية').addStringOption(o => o.setName('اغنية').setDescription('اسم أو رابط الأغنية').setRequired(true)),
  new SlashCommandBuilder().setName('skip').setDescription('تخطي الأغنية الحالية'),
  new SlashCommandBuilder().setName('stop').setDescription('إيقاف البوت ومسح القائمة'),
  new SlashCommandBuilder().setName('queue').setDescription('عرض قائمة الأغاني'),
  new SlashCommandBuilder().setName('help').setDescription('عرض الأوامر'),
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`✅ البوت شغّال: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash Commands مسجلة!');
  } catch (err) {
    console.error(err);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'play') {
    const query = interaction.options.getString('اغنية');
    const voiceChannel = interaction.member?.voice.channel;
    if (!voiceChannel) return interaction.reply({ content: '❌ لازم تكون في روم صوتي!', ephemeral: true });

    await interaction.deferReply();

    let url = query, title = query;
    try {
      if (!ytdl.validateURL(query)) {
        const results = await ytSearch(query);
        if (!results.videos.length) return interaction.editReply('❌ ما لقيت نتائج');
        url = results.videos[0].url;
        title = results.videos[0].title;
      } else {
        const info = await ytdl.getInfo(query);
        title = info.videoDetails.title;
      }
    } catch (e) {
      return interaction.editReply('❌ صار خطأ، حاول مرة ثانية');
    }

    const serverQueue = queues.get(interaction.guild.id);
    if (!serverQueue) {
      const queue = { textChannel: interaction.channel, voiceChannel, connection: null, player: null, songs: [] };
      queues.set(interaction.guild.id, queue);
      queue.songs.push({ title, url });
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });
      queue.connection = connection;
      playSong(interaction.guild.id, queue.songs[0]);
      interaction.editReply(`▶️ يشغّل الحين: **${title}**`);
    } else {
      serverQueue.songs.push({ title, url });
      interaction.editReply(`✅ **${title}** أضيفت للقائمة (#${serverQueue.songs.length})`);
    }
  }

  if (commandName === 'skip') {
    const queue = queues.get(interaction.guild.id);
    if (!queue) return interaction.reply({ content: '❌ ما في موسيقى', ephemeral: true });
    queue.player?.stop();
    interaction.reply('⏭️ تم التخطي!');
  }

  if (commandName === 'stop') {
    const queue = queues.get(interaction.guild.id);
    if (!queue) return interaction.reply({ content: '❌ ما في موسيقى', ephemeral: true });
    queue.songs = [];
    queue.player?.stop();
    queue.connection?.destroy();
    queues.delete(interaction.guild.id);
    interaction.reply('⏹️ تم الإيقاف!');
  }

  if (commandName === 'queue') {
    const queue = queues.get(interaction.guild.id);
    if (!queue || !queue.songs.length) return interaction.reply({ content: '📭 القائمة فاضية', ephemeral: true });
    const list = queue.songs.map((s, i) => `${i === 0 ? '▶️' : `${i}.`} ${s.title}`).join('\n');
    const embed = new EmbedBuilder().setTitle('🎵 قائمة الأغاني').setDescription(list).setColor(0x5865F2);
    interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'help') {
    const embed = new EmbedBuilder().setTitle('🎵 أوامر البوت').setColor(0x5865F2)
      .addFields(
        { name: '`/play [اسم/رابط]`', value: 'تشغيل أغنية' },
        { name: '`/skip`', value: 'تخطي الأغنية' },
        { name: '`/stop`', value: 'إيقاف البوت' },
        { name: '`/queue`', value: 'عرض القائمة' },
      );
    interaction.reply({ embeds: [embed] });
  }
});

function playSong(guildId, song) {
  const queue = queues.get(guildId);
  if (!song) { queue.connection?.destroy(); queues.delete(guildId); return; }
  const stream = ytdl(song.url, { filter: 'audioonly', quality: 'lowestaudio', highWaterMark: 1 << 25 });
  const resource = createAudioResource(stream);
  const player = createAudioPlayer();
  queue.player = player;
  player.play(resource);
  queue.connection.subscribe(player);
  player.on(AudioPlayerStatus.Idle, () => { queue.songs.shift(); playSong(guildId, queue.songs[0]); });
  player.on('error', (err) => { console.error(err); queue.songs.shift(); playSong(guildId, queue.songs[0]); });
  queue.textChannel.send(`▶️ يشغّل الحين: **${song.title}**`);
}

client.login(process.env.TOKEN);
