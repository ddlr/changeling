module.exports = {
    usage: 'Returns a **Patreon link** and a **Paypal link** which can be used to support the development of the bot on which this was based.',
    cooldown: 30,
    process: () => {
    	//Returns the donation links in which you can donate to the development of Yuki-chan
        return Promise.resolve({
            message: `__**You may donate to the development of bot on which this was based (WishBot) using either of the following links:**__
Monthly: **<https://patreon.com/WishBot>**
Single Donation: **<https://www.paypal.me/WishBot>**`
        })
    }
}
