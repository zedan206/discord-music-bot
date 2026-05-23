const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const distube = new DisTube(client, {
  plugins: [new YtDlpPlugin({ update: false })],
});

const commands = [
  new SlashCommandBuilder().setName('play').setDescription('شغل أغنية').addStringOption(o => o.setName('اغنية').setDescription('اسم أو رابط').setRequired(true)),
  new SlashCommandBuilder().setName('skip').setDescription('تخطي الأغنية'),
  new SlashCommandBuilder().setName('stop').setDescription('إيقاف البوت'),
  new SlashCommandBuilder().setName('queue').setDescription('عرض القائمة'),
  new SlashCommandBuilder().setName('pause').setDescription('إيقاف مؤقت'),
  new SlashCommandBuilder().setName('resume').setDescription('استكمال التشغيل'),
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
      await distube.play(voiceChannel, query, { textChannel: channel, member });
      interaction.editReply(`🔍 جاري البحث عن: **${query}**`);
    } catch (err) {
      console.error(err);
      interaction.editReply('❌ صار خطأ، حاول مرة ثانية');
    }
  }

  if (commandName === 'skip') {
    const queue = distube.getQueue(guild);
    if (!queue) return interaction.reply({ content: '❌ ما في موسيقى', ephemeral: true });
    await queue.skip();
    interaction.reply('⏭️ تم التخطي!');
  }

  if (commandName === 'stop') {
    const queue = distube.getQueue(guild);
    if (!queue) return interaction.reply({ content: '❌ ما في موسيقى', ephemeral: true });
    await queue.stop();
    interaction.reply('⏹️ تم الإيقاف!');
  }

  if (commandName === 'pause') {
    const queue = distube.getQueue(guild);
    if (!queue) return interaction.reply({ content: '❌ ما في موسيقى', ephemeral: true });
    queue.pause();
    interaction.reply('⏸️ تم الإيقاف المؤقت!');
  }

  if (commandName === 'resume') {
    const queue = distube.getQueue(guild);
    if (!queue) return interaction.reply({ content: '❌ ما في موسيقى', ephemeral: true });
    queue.resume();
    interaction.reply('▶️ تم الاستكمال!');
  }

  if (commandName === 'queue') {
    const queue = distube.getQueue(guild);
    if (!queue) return interaction.reply({ content: '📭 القائمة فاضية', ephemeral: true });
    const list = queue.songs.map((s, i) => `${i === 0 ? '▶️' : `${i}.`} ${s.name} - ${s.formattedDuration}`).join('\n');
    const embed = new EmbedBuilder().setTitle('🎵 قائمة الأغاني').setDescription(list).setColor(0x5865F2);
    interaction.reply({ embeds: [embed] });
  }
});

distube.on('playSong', (queue, song) => {
  queue.textChannel?.send(`▶️ يشغّل الحين: **${song.name}** - ${song.formattedDuration}`);
});

distube.on('addSong', (queue, song) => {
  queue.textChannel?.send(`✅ أضيفت: **${song.name}** (#${queue.songs.length})`);
});

distube.on('error', (channel, error) => {
  console.error('DisTube error:', error);
  channel?.send('❌ صار خطأ في التشغيل');
});

distube.on('finish', queue => {
  queue.textChannel?.send('✅ انتهت قائمة الأغاني!');
});

client.login(process.env.TOKEN);
