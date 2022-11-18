# bfx-wrk-base

git clone git@github.com:bitfinexcom/REPO.git REPO

git remote -v

git remote add upstream git@github.com:bitfinexcom/PARENT.git

git remote -v

git push origin master

## Config validation

If config file has corresponding `.example` file, by default `loadConf` will run a check for missing keys.

If config is missing some keys that are present in `.example` file, program will exit and report all missing keys.

`loadConf` accepts 3rd, optional validation object parameter:

```js
this.loadConf("cosmos.coin", "coin", {
  symbol: {
    required: true,
    sameAsExample: true,
  },
  "some.nested.value": {
    required: true,
  },
});
```

Keys of this validation object are used to access config values using lodash `_.get` so you can
chain access pattern as in example above `some.nested.value`. You can specify here if the value is
`required: true` and if value is equal to corresponding value from `.example` file `sameAsExample: true`.
