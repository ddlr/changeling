module.exports = {
    usage: "This bot prints a sneaky lenny in the current channel",
    delete: true,
    cooldown: 5,
    process: function(bot, msg) {
        bot.createMessage(msg.channel.id, "┬┴┬┴┤ ͜ʖ ͡°) ├┬┴┬┴")
    }
}