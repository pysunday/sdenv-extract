start=$1
end=$2
for i in $(eval echo "{$start..$end}"); do
  pattern="run_*_$i.js"
  files_chrome=($(find "./output/chrome/" -name "$pattern"))
  files_jsdom=($(find "./output/jsdom/" -name "$pattern"))

  if [ ${#files_chrome[@]} -gt 0 ] && [ ${#files_jsdom[@]} -gt 0 ]; then
    file_chrome="${files_chrome[0]}"
    file_jsdom="${files_jsdom[0]}"

    result=$(diff "$file_chrome" "$file_jsdom")
    if [ $? -ne 0 ]; then
      echo "差异：$i"
      # echo "$result"
    fi
  else
    echo "文件不存在：$i"
  fi
done
